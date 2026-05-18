from app.services.custom_alert_engine import build_metric_snapshot, evaluate_rule_condition


def test_legacy_single_condition_still_evaluates():
    condition = {"metric": "temp", "operator": ">", "value": 25}

    assert evaluate_rule_condition(condition, {"temp": 26}) is True
    assert evaluate_rule_condition(condition, {"temp": 24}) is False


def test_compound_and_requires_all_conditions_to_match():
    condition = {
        "logic": "AND",
        "conditions": [
            {"metric": "temp", "operator": ">", "value": 25},
            {"metric": "wind_speed", "operator": ">", "value": 5},
        ],
    }

    assert evaluate_rule_condition(condition, {"temp": 26, "wind_speed": 5.5}) is True
    assert evaluate_rule_condition(condition, {"temp": 26, "wind_speed": 4.5}) is False


def test_compound_or_matches_any_condition():
    condition = {
        "logic": "OR",
        "conditions": [
            {"metric": "humidity", "operator": "<", "value": 30},
            {"metric": "wind_speed", "operator": ">", "value": 8},
        ],
    }

    assert evaluate_rule_condition(condition, {"humidity": 45, "wind_speed": 9}) is True
    assert evaluate_rule_condition(condition, {"humidity": 45, "wind_speed": 3}) is False


def test_nested_conditions_short_circuit_as_grouped_expression():
    condition = {
        "logic": "AND",
        "conditions": [
            {"metric": "temp", "operator": ">", "value": 25},
            {
                "logic": "OR",
                "conditions": [
                    {"metric": "wind_speed", "operator": ">", "value": 5},
                    {"metric": "humidity", "operator": "<", "value": 35},
                ],
            },
        ],
    }

    assert evaluate_rule_condition(condition, {"temp": 26, "wind_speed": 4, "humidity": 34}) is True
    assert evaluate_rule_condition(condition, {"temp": 26, "wind_speed": 4, "humidity": 45}) is False


def test_metric_aliases_support_existing_sensor_rule_names():
    condition = {"metric": "sensor_temp", "operator": ">=", "value": 30}

    assert evaluate_rule_condition(condition, {"temp": 30}) is True


def test_build_metric_snapshot_ignores_non_numeric_values():
    snapshot = build_metric_snapshot(
        {"temp": "27.5", "label": "north field", "humidity": None},
        extra={"battery_pct": "18"},
    )

    assert snapshot == {"temp": 27.5, "battery_pct": 18.0}
