"""
Luxury Authenticator — Year-1 Financial Projection Model
========================================================
Builds monthly P&L for Year 1 across 3 scenarios (Conservative/Base/Optimistic).

ASSUMPTIONS DERIVED FROM:
- Thailand luxury watch market: USD 310M (2025), 4% CAGR [Statista]
- Counterfeit pain real: 50%+ of fakes are Rolex; Thailand prominent in fake market
- Competitor pricing: Entrupy $139-1049/mo, LegitCheck $10-20/item, eBay AG $80
- SEA freemium conversion: 1-3% install→paid
- Apple/Google take: 15% (small-biz program first year)
- Existing tier prices set in code: Std ฿990 / Pro ฿1,990 / Premium ฿4,990
"""

from dataclasses import dataclass, field
from typing import Dict, List


# ────────────────────────────────────────────────────────────────────
# Pricing & cost structure
# ────────────────────────────────────────────────────────────────────

TIER_PRICE_THB = {
    'standard': 990,
    'pro':      1990,
    'premium':  4990,
}

TIER_SCAN_LIMIT = {        # monthly scan quota
    'free':     5,
    'standard': 50,
    'pro':      100,
    'premium':  200,
}

# Average scans actually used (utilization rate per tier)
TIER_AVG_SCANS = {
    'free':     3.5,    # 70% use almost all 5
    'standard': 28,     # 56% utilization
    'pro':      55,     # 55% utilization
    'premium':  110,    # 55% utilization (dealer flow)
}

# Cost per scan in THB (steady state with all optimizations):
#   - 60% cache hit (price+identify reused) →  ฿0.30
#   - 25% cheap-brand bypass               →  ฿1.10
#   - 15% full pipeline                    →  ฿2.98
COST_PER_SCAN_THB = 0.6 * 0.30 + 0.25 * 1.10 + 0.15 * 2.98  # ≈ ฿0.90

# Fixed monthly infrastructure costs (THB)
FIXED_COSTS_THB = {
    'replicate_keepwarm':  140,    # B10-qoff cron
    'supabase_plan':       875,    # Pro plan $25/mo
    'gemini_baseline':     350,    # baseline minimum even with 0 users
    'domain_misc':         300,    # luxauth.img.co, etc.
    'monitoring':          200,    # error tracking, logging
}

# App store take rate (Apple Small Business Program / Google equiv = 15%)
APP_STORE_TAKE_RATE = 0.15


# ────────────────────────────────────────────────────────────────────
# Scenarios
# ────────────────────────────────────────────────────────────────────

@dataclass
class Scenario:
    name: str
    label_th: str
    # Acquisition funnel
    m1_installs: int
    growth_curve: List[float]      # MoM growth rate by month (length 11)
    install_to_trial: float        # % of installs that start trial
    trial_to_paid: float           # % of trial users converting to paid
    # Distribution within paid users
    tier_mix: Dict[str, float]     # standard/pro/premium %, must sum to 1
    # Retention
    monthly_churn: List[float]     # 12 values, % of paid users lost per month
    # Marketing spend (THB/month)
    marketing_spend: List[float]


CONSERVATIVE = Scenario(
    name='conservative',
    label_th='Conservative (ต่ำ)',
    m1_installs=250,
    growth_curve=[0.20, 0.20, 0.20, 0.18, 0.18, 0.15, 0.15, 0.12, 0.10, 0.10, 0.08],
    install_to_trial=0.18,
    trial_to_paid=0.15,
    tier_mix={'standard': 0.75, 'pro': 0.20, 'premium': 0.05},
    monthly_churn=[0.18, 0.16, 0.14, 0.13, 0.12, 0.12, 0.11, 0.11, 0.10, 0.10, 0.10, 0.10],
    marketing_spend=[5000]*3 + [10000]*3 + [15000]*3 + [20000]*3,
)

REALISTIC = Scenario(
    name='realistic',
    label_th='Realistic (กลาง — Base case)',
    m1_installs=500,
    growth_curve=[0.40, 0.35, 0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.13, 0.12],
    install_to_trial=0.25,
    trial_to_paid=0.20,
    tier_mix={'standard': 0.70, 'pro': 0.22, 'premium': 0.08},
    monthly_churn=[0.15, 0.13, 0.12, 0.10, 0.10, 0.09, 0.09, 0.08, 0.08, 0.08, 0.08, 0.08],
    marketing_spend=[10000]*3 + [20000]*3 + [30000]*3 + [40000]*3,
)

OPTIMISTIC = Scenario(
    name='optimistic',
    label_th='Optimistic (สูง)',
    m1_installs=1000,
    growth_curve=[0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.27, 0.24, 0.20, 0.17, 0.15],
    install_to_trial=0.32,
    trial_to_paid=0.27,
    tier_mix={'standard': 0.62, 'pro': 0.27, 'premium': 0.11},
    monthly_churn=[0.12, 0.10, 0.09, 0.08, 0.08, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06, 0.06],
    marketing_spend=[20000]*3 + [40000]*3 + [60000]*3 + [80000]*3,
)


# ────────────────────────────────────────────────────────────────────
# Projection engine
# ────────────────────────────────────────────────────────────────────

def run_month_by_month(s: Scenario):
    """Return per-month list of dicts with full P&L breakdown."""
    months = []
    installs_cumulative = 0
    paid_users = {'standard': 0.0, 'pro': 0.0, 'premium': 0.0}
    free_users = 0.0   # holds those who registered but never paid

    for m in range(1, 13):
        # ── Acquisition ──
        if m == 1:
            new_installs = s.m1_installs
        else:
            g = s.growth_curve[m-2]
            new_installs = round(installs_cumulative * (1 + g) - installs_cumulative)
        installs_cumulative += new_installs

        # Funnel
        new_trials = new_installs * s.install_to_trial
        new_paid = new_trials * s.trial_to_paid
        new_free_only = new_installs - new_trials  # never trial

        # Distribute new paid across tiers
        new_paid_by_tier = {t: new_paid * pct for t, pct in s.tier_mix.items()}

        # ── Churn ──
        churn_rate = s.monthly_churn[m-1]
        churned = {t: paid_users[t] * churn_rate for t in paid_users}

        # ── Update active populations ──
        for t in paid_users:
            paid_users[t] = paid_users[t] - churned[t] + new_paid_by_tier[t]

        free_users += new_free_only  # accumulate (some will churn but
                                      # we don't bother tracking those)

        active_paid = sum(paid_users.values())

        # ── Revenue ──
        revenue_by_tier = {t: paid_users[t] * TIER_PRICE_THB[t] for t in paid_users}
        gross_revenue = sum(revenue_by_tier.values())
        app_store_fee = gross_revenue * APP_STORE_TAKE_RATE
        net_revenue = gross_revenue - app_store_fee

        # ── Variable costs (scan costs) ──
        # Active scanning population = paid + free (free still scans)
        free_scan_cost = free_users * TIER_AVG_SCANS['free'] * COST_PER_SCAN_THB
        paid_scan_cost = sum(
            paid_users[t] * TIER_AVG_SCANS[t] * COST_PER_SCAN_THB for t in paid_users
        )
        variable_costs = free_scan_cost + paid_scan_cost

        # ── Fixed costs ──
        fixed_costs = sum(FIXED_COSTS_THB.values())

        # ── Marketing ──
        marketing = s.marketing_spend[m-1]

        # ── P&L ──
        total_costs = variable_costs + fixed_costs + marketing
        gross_profit = net_revenue - variable_costs
        net_profit = net_revenue - total_costs

        months.append({
            'month': m,
            'new_installs': round(new_installs),
            'cumulative_installs': round(installs_cumulative),
            'new_paid': round(new_paid),
            'churned_paid': round(sum(churned.values())),
            'active_paid_standard': round(paid_users['standard']),
            'active_paid_pro': round(paid_users['pro']),
            'active_paid_premium': round(paid_users['premium']),
            'active_paid_total': round(active_paid),
            'free_users': round(free_users),
            # Revenue
            'rev_standard': round(revenue_by_tier['standard']),
            'rev_pro': round(revenue_by_tier['pro']),
            'rev_premium': round(revenue_by_tier['premium']),
            'gross_revenue': round(gross_revenue),
            'app_store_fee': round(app_store_fee),
            'net_revenue': round(net_revenue),
            # Costs
            'free_scan_cost': round(free_scan_cost),
            'paid_scan_cost': round(paid_scan_cost),
            'variable_costs': round(variable_costs),
            'fixed_costs': round(fixed_costs),
            'marketing': round(marketing),
            'total_costs': round(total_costs),
            # Bottom line
            'gross_profit': round(gross_profit),
            'gross_margin_pct': round((gross_profit / net_revenue * 100) if net_revenue > 0 else 0, 1),
            'net_profit': round(net_profit),
        })

    return months


def summarize(scenario: Scenario):
    rows = run_month_by_month(scenario)
    total_gross_rev = sum(r['gross_revenue'] for r in rows)
    total_net_rev = sum(r['net_revenue'] for r in rows)
    total_var_cost = sum(r['variable_costs'] for r in rows)
    total_fixed = sum(r['fixed_costs'] for r in rows)
    total_mkt = sum(r['marketing'] for r in rows)
    total_net_profit = sum(r['net_profit'] for r in rows)
    last = rows[-1]

    print(f"\n{'='*70}")
    print(f"SCENARIO: {scenario.label_th}")
    print(f"{'='*70}")
    print(f"Year-1 Totals:")
    print(f"  Cumulative installs:  {last['cumulative_installs']:,}")
    print(f"  Active paid (M12):    {last['active_paid_total']:,}")
    print(f"    Standard:           {last['active_paid_standard']:,}")
    print(f"    Pro:                {last['active_paid_pro']:,}")
    print(f"    Premium:            {last['active_paid_premium']:,}")
    print(f"  Gross revenue:        ฿{total_gross_rev:,.0f}")
    print(f"  Net revenue:          ฿{total_net_rev:,.0f}")
    print(f"  Variable costs:       ฿{total_var_cost:,.0f}")
    print(f"  Fixed costs:          ฿{total_fixed:,.0f}")
    print(f"  Marketing:            ฿{total_mkt:,.0f}")
    print(f"  NET PROFIT/LOSS:      ฿{total_net_profit:,.0f}")
    print(f"\nMonthly preview (last 3 months):")
    for r in rows[-3:]:
        print(f"  M{r['month']:>2}: paid={r['active_paid_total']:>5}, "
              f"net_rev=฿{r['net_revenue']:>10,}, "
              f"net_profit=฿{r['net_profit']:>10,}")
    return rows


if __name__ == '__main__':
    for s in [CONSERVATIVE, REALISTIC, OPTIMISTIC]:
        summarize(s)

    print(f"\nKey cost assumption: ฿{COST_PER_SCAN_THB:.2f}/scan (steady-state blended)")
