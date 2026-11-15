"""Synthetic reference model; risk is a heuristic score, not a probability."""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES = ['packet_rate', 'byte_rate', 'average_packet_size', 'destination_count', 'port_diversity']


def normal_features(rng):
    rate = float(rng.uniform(8, 35))
    size = float(rng.uniform(150, 700))
    return [rate, rate * size, size, int(rng.integers(1, 5)), int(rng.integers(1, 4))]


class Detector:
    def __init__(self):
        rng = np.random.default_rng(42)
        training = pd.DataFrame([normal_features(rng) for _ in range(1500)], columns=FEATURES)
        self.model = IsolationForest(n_estimators=100, contamination=0.03, random_state=42)
        self.model.fit(training)
        self.training_samples = len(training)

    def evaluate(self, features):
        reasons = []
        for key, limit, explanation in [
            ('packet_rate', 80, 'Packet rate exceeds 80 packets/s'),
            ('byte_rate', 50000, 'Byte rate exceeds 50,000 bytes/s'),
            ('average_packet_size', 1200, 'Average packet size exceeds 1,200 bytes'),
            ('destination_count', 12, 'Destination count exceeds 12 per window'),
            ('port_diversity', 10, 'Port diversity exceeds 10 per window'),
        ]:
            if features[key] > limit:
                reasons.append(explanation)
        rule_score = min(1.0, len(reasons) / 3)
        frame = pd.DataFrame([[features[k] for k in FEATURES]], columns=FEATURES)
        decision = float(self.model.decision_function(frame)[0])
        ml_anomaly = decision < 0
        # Piecewise normalization of model distance, deliberately not calibrated probability.
        ml_score = float(np.clip(0.3 - decision * 3, 0, 1))
        risk = round(0.6 * rule_score + 0.4 * ml_score, 4)
        if ml_anomaly:
            reasons.append('Isolation Forest: deviation from synthetic normal reference')
        severity = 'critical' if risk >= 0.8 else 'high' if risk >= 0.6 else 'medium' if risk >= 0.4 else 'low'
        return dict(risk_score=risk, rule_score=round(rule_score, 4), ml_score=round(ml_score, 4),
                    ml_anomaly=ml_anomaly, model_decision=round(decision, 6), reasons=reasons, severity=severity)
