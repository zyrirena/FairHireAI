#!/usr/bin/env python3
"""
FairHire AI — Fairlearn Fairness Analysis
Computes comprehensive fairness metrics using Microsoft Fairlearn on
evaluation data stored in the FairHire AI database.

Called from Node.js:
  python3 fairlearnAnalysis.py <input.json> <output.json>

Input JSON:
{
  "evaluations": [
    {
      "qualification": "Meets requirements",
      "skills_match_score": 8.0,
      "experience_score": 7.0,
      "education_score": 9.0,
      "overall_score": 8.0,
      "group": "Female-coded",   // sensitive feature
      "recruiter_override": null  // ground truth if available
    }, ...
  ],
  "test_name": "Gender Name Test",
  "group_a_label": "Female-coded names",
  "group_b_label": "Male-coded names"
}
"""
import json
import sys
import numpy as np

try:
    from fairlearn.metrics import (
        MetricFrame,
        demographic_parity_ratio,
        demographic_parity_difference,
        equalized_odds_ratio,
        equalized_odds_difference,
        selection_rate,
        true_positive_rate,
        false_positive_rate,
    )
    from sklearn.metrics import accuracy_score, precision_score, recall_score
    FAIRLEARN_AVAILABLE = True
except ImportError:
    FAIRLEARN_AVAILABLE = False


def qualification_to_binary(q):
    """Convert qualification string to binary (1 = selected/positive, 0 = not selected)."""
    return 1 if q == 'Meets requirements' else 0


def compute_fairlearn_metrics(evaluations, group_a_label, group_b_label):
    """Compute full Fairlearn metric suite on evaluation data."""

    if not evaluations:
        return {"error": "No evaluation data provided"}

    # Build arrays
    y_pred = np.array([qualification_to_binary(e['qualification']) for e in evaluations])
    sensitive = np.array([e.get('group', 'unknown') for e in evaluations])
    scores = np.array([e.get('overall_score', 5.0) for e in evaluations])

    # Ground truth: use recruiter override if available, otherwise use AI prediction as proxy
    has_ground_truth = any(e.get('recruiter_override') is not None for e in evaluations)
    if has_ground_truth:
        y_true = np.array([
            qualification_to_binary(e['recruiter_override']) if e.get('recruiter_override') is not None
            else qualification_to_binary(e['qualification'])
            for e in evaluations
        ])
    else:
        # Without ground truth, use AI prediction as proxy (self-evaluation)
        y_true = y_pred.copy()

    groups = sorted(set(sensitive))
    group_counts = {g: int(np.sum(sensitive == g)) for g in groups}
    group_selection_rates = {g: float(np.mean(y_pred[sensitive == g])) for g in groups}
    group_avg_scores = {g: float(np.mean(scores[sensitive == g])) for g in groups}

    # ── Core Fairlearn MetricFrame ──
    metric_fns = {
        'selection_rate': selection_rate,
    }
    if has_ground_truth and len(set(y_true)) > 1:
        metric_fns['true_positive_rate'] = true_positive_rate
        metric_fns['false_positive_rate'] = false_positive_rate

    mf = MetricFrame(
        metrics=metric_fns,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive,
    )

    by_group_raw = mf.by_group.to_dict()
    by_group = {}
    for metric_name, group_vals in by_group_raw.items():
        for grp, val in group_vals.items():
            if grp not in by_group:
                by_group[grp] = {}
            by_group[grp][metric_name] = round(float(val) if not (isinstance(val, float) and np.isnan(val)) else 0.0, 4)

    # ── Demographic Parity ──
    dp_ratio = float(demographic_parity_ratio(y_true, y_pred, sensitive_features=sensitive))
    dp_diff = float(demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive))

    # ── Equalized Odds (only if ground truth available) ──
    eq_odds_ratio = None
    eq_odds_diff = None
    if has_ground_truth and len(set(y_true)) > 1:
        try:
            eq_odds_ratio = float(equalized_odds_ratio(y_true, y_pred, sensitive_features=sensitive))
            eq_odds_diff = float(equalized_odds_difference(y_true, y_pred, sensitive_features=sensitive))
        except Exception:
            pass

    # ── EEOC Four-Fifths Rule ──
    # Computed across all group pairs
    eeoc_results = {}
    for i, g1 in enumerate(groups):
        for g2 in groups[i+1:]:
            r1 = group_selection_rates.get(g1, 0)
            r2 = group_selection_rates.get(g2, 0)
            high = max(r1, r2)
            low = min(r1, r2)
            ratio = low / high if high > 0 else 1.0
            pair_key = f"{g1} vs {g2}"
            eeoc_results[pair_key] = {
                "ratio": round(ratio, 4),
                "passes": ratio >= 0.8,
                "group_1": g1,
                "group_2": g2,
                "rate_1": round(r1, 4),
                "rate_2": round(r2, 4),
            }

    # ── Score Distribution per Group ──
    score_distribution = {}
    for g in groups:
        g_scores = scores[sensitive == g]
        score_distribution[g] = {
            "mean": round(float(np.mean(g_scores)), 3),
            "std": round(float(np.std(g_scores)), 3),
            "min": round(float(np.min(g_scores)), 3),
            "max": round(float(np.max(g_scores)), 3),
            "median": round(float(np.median(g_scores)), 3),
        }

    # ── Overall pass/fail ──
    all_eeoc_pass = all(v["passes"] for v in eeoc_results.values())
    dp_pass = dp_ratio >= 0.8
    overall_pass = all_eeoc_pass and dp_pass

    return {
        "fairlearn_available": True,
        "has_ground_truth": has_ground_truth,
        "sample_size": len(evaluations),
        "groups": groups,
        "group_counts": group_counts,
        "group_selection_rates": {k: round(v, 4) for k, v in group_selection_rates.items()},
        "group_avg_scores": {k: round(v, 3) for k, v in group_avg_scores.items()},
        "score_distribution": score_distribution,
        "by_group_metrics": by_group,
        "demographic_parity": {
            "ratio": round(dp_ratio, 4),
            "difference": round(dp_diff, 4),
            "passes_80_rule": dp_pass,
            "interpretation": (
                "All groups have equal selection rates" if dp_ratio == 1.0
                else f"Selection rates differ by {abs(dp_diff)*100:.1f}pp across groups"
            ),
        },
        "equalized_odds": {
            "ratio": round(eq_odds_ratio, 4) if eq_odds_ratio is not None else None,
            "difference": round(eq_odds_diff, 4) if eq_odds_diff is not None else None,
            "available": eq_odds_ratio is not None,
            "note": "Requires recruiter override data as ground truth" if not has_ground_truth else None,
        },
        "eeoc_four_fifths": eeoc_results,
        "overall": {
            "passes": overall_pass,
            "status": "PASS" if overall_pass else "FAIL",
            "eeoc_passes": all_eeoc_pass,
            "demographic_parity_passes": dp_pass,
        },
    }


def fallback_metrics(evaluations, group_a_label, group_b_label):
    """Simple metrics when Fairlearn is not installed."""
    groups = {}
    for e in evaluations:
        g = e.get('group', 'unknown')
        if g not in groups:
            groups[g] = {"total": 0, "selected": 0, "scores": []}
        groups[g]["total"] += 1
        if e.get('qualification') == 'Meets requirements':
            groups[g]["selected"] += 1
        groups[g]["scores"].append(e.get('overall_score', 5.0))

    rates = {g: d["selected"] / max(d["total"], 1) for g, d in groups.items()}
    all_rates = list(rates.values())
    high = max(all_rates) if all_rates else 1
    low = min(all_rates) if all_rates else 0
    di = low / high if high > 0 else 1.0

    return {
        "fairlearn_available": False,
        "note": "Install fairlearn for full metrics: pip install fairlearn scikit-learn",
        "sample_size": len(evaluations),
        "group_selection_rates": {k: round(v, 4) for k, v in rates.items()},
        "demographic_parity": {
            "ratio": round(di, 4),
            "difference": round(high - low, 4),
            "passes_80_rule": di >= 0.8,
        },
        "overall": {"passes": di >= 0.8, "status": "PASS" if di >= 0.8 else "FAIL"},
    }


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else None
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not input_path:
        print(json.dumps({"error": "Usage: fairlearnAnalysis.py <input.json> <output.json>"}))
        sys.exit(1)

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    evaluations = data.get('evaluations', [])
    group_a_label = data.get('group_a_label', 'Group A')
    group_b_label = data.get('group_b_label', 'Group B')
    test_name = data.get('test_name', 'Fairness Analysis')

    if FAIRLEARN_AVAILABLE:
        result = compute_fairlearn_metrics(evaluations, group_a_label, group_b_label)
    else:
        result = fallback_metrics(evaluations, group_a_label, group_b_label)

    result['test_name'] = test_name
    result['group_a_label'] = group_a_label
    result['group_b_label'] = group_b_label
    result['timestamp'] = __import__('datetime').datetime.now().isoformat()

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
    else:
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
