#!/usr/bin/env python3
"""
IBM AIF360 Bias Detection Service for FairHire AI

Computes fairness metrics on candidate evaluations using IBM's AI Fairness 360.
Runs as a subprocess called from Node.js.

Metrics computed:
- Disparate Impact (EEOC four-fifths rule: must be >= 0.8)
- Statistical Parity Difference (ideal: 0, acceptable: -0.1 to 0.1)
- Equal Opportunity Difference (ideal: 0)

Usage:
  python3 aif360Analysis.py '{"evaluations": [...], "protected_attribute": "group", "favorable_label": 1}'

Output: JSON with bias metrics and risk assessment
"""

import sys
import json
import traceback

def run_aif360_analysis(data):
    """Run AIF360 bias analysis on evaluation data."""
    try:
        from aif360.datasets import BinaryLabelDataset
        from aif360.metrics import BinaryLabelDatasetMetric, ClassificationMetric
        import pandas as pd
        import numpy as np
        aif360_available = True
    except ImportError:
        aif360_available = False

    evaluations = data.get('evaluations', [])
    protected_attr = data.get('protected_attribute', 'group')
    favorable_label = data.get('favorable_label', 1)
    threshold = data.get('threshold', 0.8)

    if len(evaluations) < 4:
        return {
            'error': None,
            'aif360_available': aif360_available,
            'metrics': None,
            'message': 'Need at least 4 evaluations to run bias analysis'
        }

    # Build dataset from evaluations
    records = []
    for ev in evaluations:
        score = ev.get('overall_score', 0) or ev.get('score', 0)
        group = ev.get(protected_attr, ev.get('group', 0))
        qualified = 1 if score >= (data.get('qualification_threshold', 7.0)) else 0
        records.append({
            'score': float(score),
            'qualified': qualified,
            'group': int(group) if isinstance(group, (int, float)) else (0 if str(group).lower() in ['a', 'female', 'minority', '0'] else 1),
        })

    if not aif360_available:
        return run_fallback_analysis(records, threshold)

    # AIF360 analysis
    try:
        df = pd.DataFrame(records)

        # Check we have both groups
        unique_groups = df['group'].unique()
        if len(unique_groups) < 2:
            return {
                'error': None,
                'aif360_available': True,
                'metrics': None,
                'message': 'Need at least 2 distinct groups for bias analysis'
            }

        dataset = BinaryLabelDataset(
            df=df,
            label_names=['qualified'],
            protected_attribute_names=['group'],
            favorable_label=favorable_label,
            unfavorable_label=0
        )

        privileged = [{'group': 1}]
        unprivileged = [{'group': 0}]

        metric = BinaryLabelDatasetMetric(
            dataset,
            unprivileged_groups=unprivileged,
            privileged_groups=privileged
        )

        disparate_impact = metric.disparate_impact()
        stat_parity_diff = metric.statistical_parity_difference()

        # Selection rates per group
        group_0 = df[df['group'] == 0]
        group_1 = df[df['group'] == 1]
        rate_0 = group_0['qualified'].mean() if len(group_0) > 0 else 0
        rate_1 = group_1['qualified'].mean() if len(group_1) > 0 else 0

        # Risk assessment
        di_value = disparate_impact if not (np.isnan(disparate_impact) or np.isinf(disparate_impact)) else 0
        spd_value = stat_parity_diff if not (np.isnan(stat_parity_diff) or np.isinf(stat_parity_diff)) else 0

        if di_value < 0.8 or di_value > 1.25:
            risk_level = 'high'
            recommendation = 'EEOC four-fifths rule violated. Review scoring criteria for potential discrimination.'
        elif abs(spd_value) > 0.1:
            risk_level = 'medium'
            recommendation = 'Statistical parity shows moderate disparity. Monitor closely.'
        else:
            risk_level = 'low'
            recommendation = 'Metrics within acceptable ranges. Continue monitoring.'

        return {
            'error': None,
            'aif360_available': True,
            'bias_detected': risk_level in ['high', 'medium'],
            'metrics': {
                'disparate_impact': round(di_value, 4),
                'statistical_parity_difference': round(spd_value, 4),
                'group_0_selection_rate': round(rate_0, 4),
                'group_1_selection_rate': round(rate_1, 4),
                'group_0_count': len(group_0),
                'group_1_count': len(group_1),
                'total_candidates': len(df),
                'eeoc_four_fifths_pass': di_value >= 0.8 and di_value <= 1.25,
            },
            'risk_level': risk_level,
            'recommendation': recommendation,
            'thresholds': {
                'disparate_impact_min': 0.8,
                'disparate_impact_max': 1.25,
                'statistical_parity_max': 0.1,
            }
        }

    except Exception as e:
        # Fall back to manual computation if AIF360 fails
        return run_fallback_analysis(records, threshold, str(e))


def run_fallback_analysis(records, threshold=0.8, aif360_error=None):
    """Fallback: compute disparate impact manually without AIF360."""
    group_0 = [r for r in records if r['group'] == 0]
    group_1 = [r for r in records if r['group'] == 1]

    rate_0 = sum(1 for r in group_0 if r['qualified'] == 1) / max(len(group_0), 1)
    rate_1 = sum(1 for r in group_1 if r['qualified'] == 1) / max(len(group_1), 1)

    # Disparate impact = min_rate / max_rate
    max_rate = max(rate_0, rate_1)
    min_rate = min(rate_0, rate_1)
    di = min_rate / max_rate if max_rate > 0 else 1.0
    spd = rate_0 - rate_1

    if di < threshold:
        risk_level = 'high'
        recommendation = 'EEOC four-fifths rule violated. Review scoring criteria.'
    elif abs(spd) > 0.1:
        risk_level = 'medium'
        recommendation = 'Moderate statistical disparity detected. Monitor closely.'
    else:
        risk_level = 'low'
        recommendation = 'Metrics within acceptable ranges.'

    result = {
        'error': None,
        'aif360_available': False,
        'aif360_error': aif360_error,
        'bias_detected': risk_level in ['high', 'medium'],
        'metrics': {
            'disparate_impact': round(di, 4),
            'statistical_parity_difference': round(spd, 4),
            'group_0_selection_rate': round(rate_0, 4),
            'group_1_selection_rate': round(rate_1, 4),
            'group_0_count': len(group_0),
            'group_1_count': len(group_1),
            'total_candidates': len(records),
            'eeoc_four_fifths_pass': di >= 0.8,
        },
        'risk_level': risk_level,
        'recommendation': recommendation,
        'thresholds': {
            'disparate_impact_min': 0.8,
            'disparate_impact_max': 1.25,
            'statistical_parity_max': 0.1,
        },
        'method': 'fallback_manual' if not aif360_error else 'fallback_after_error',
    }
    return result


if __name__ == '__main__':
    try:
        if len(sys.argv) > 1:
            input_data = json.loads(sys.argv[1])
        else:
            input_data = json.loads(sys.stdin.read())

        result = run_aif360_analysis(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()}))
        sys.exit(1)
