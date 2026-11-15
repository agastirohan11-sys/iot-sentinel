import numpy as np
import pytest
from app.detection import Detector, normal_features, FEATURES


@pytest.fixture(scope='module')
def model():
    return Detector()


def test_reference_is_reproducible(model):
    other = Detector()
    row = dict(zip(FEATURES, [20, 8000, 400, 2, 2]))
    assert model.evaluate(row) == other.evaluate(row)


def test_abnormal_scores_higher_than_normal(model):
    normal = model.evaluate(dict(zip(FEATURES, [20, 8000, 400, 2, 2])))
    abnormal = model.evaluate(dict(zip(FEATURES, [300, 400000, 1333, 40, 30])))
    assert 0 <= normal['risk_score'] < 0.4
    assert 0.6 <= abnormal['risk_score'] <= 1
    assert abnormal['risk_score'] > normal['risk_score']
    assert abnormal['severity'] in ['high', 'critical']
    assert abnormal['rule_score'] == 1
    assert abnormal['ml_anomaly']
    assert len(abnormal['reasons']) == 6


def test_zero_traffic_is_finite(model):
    result = model.evaluate(dict.fromkeys(FEATURES, 0))
    assert np.isfinite(result['risk_score'])
    assert 0 <= result['risk_score'] <= 1


def test_synthetic_normal_ranges():
    rng = np.random.default_rng(123)
    for _ in range(100):
        rate, byte_rate, size, destinations, ports = normal_features(rng)
        assert 8 <= rate <= 35
        assert 150 <= size <= 700
        assert byte_rate == rate * size
        assert 1 <= destinations <= 4
        assert 1 <= ports <= 3
