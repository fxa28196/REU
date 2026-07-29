# Learning-algorithm component — regressions on the model's own output

Model family: **logistic regression** for the binary outcome (got inside or not) — the standard family for evacuation outcomes; **OLS** for time-to-shelter among those who got inside. Fitted by IRLS/least squares (numpy), standard errors from the information matrix. Features are agent INPUTS plus distance to the nearest shelter site; the assigned shelter is an outcome and is excluded.

## Arm A — logistic: P(sheltered), n=61,307 (9 seeds pooled; unreachable excluded), share sheltered 0.302
McFadden pseudo-R2 = 0.244; in-sample accuracy = 0.786

| feature | coef | odds ratio | SE | p |
|---|---|---|---|---|
| intercept | -3.0409 |  | 0.0751 | 0.00e+00 |
| age_55plus | +0.0075 | 1.008 | 0.0245 | 7.60e-01 |
| female | -0.0067 | 0.993 | 0.0230 | 7.71e-01 |
| sex_other | -0.0497 | 0.952 | 0.0700 | 4.78e-01 |
| mobility_limited | +0.2069 | 1.230 | 0.0324 | 1.61e-10 |
| asthma | -0.0053 | 0.995 | 0.0289 | 8.54e-01 |
| copd | -0.0283 | 0.972 | 0.0361 | 4.32e-01 |
| chronic_physical | +0.0028 | 1.003 | 0.0210 | 8.95e-01 |
| walking_speed_mps | +2.9917 | 19.920 | 0.0525 | 0.00e+00 |
| dist_nearest_shelter_km | -1.6564 | 0.191 | 0.0185 | 0.00e+00 |

### OLS: travel_time_min among sheltered (n=18,504), R2 = 0.296
| feature | coef (min) | SE | p |
|---|---|---|---|
| intercept | -62.95 | 3.174 | 0.00e+00 |
| age_55plus | -0.37 | 1.092 | 7.37e-01 |
| female | -2.51 | 1.023 | 1.43e-02 |
| sex_other | -4.80 | 3.079 | 1.19e-01 |
| mobility_limited | +12.69 | 1.475 | 0.00e+00 |
| asthma | +1.46 | 1.264 | 2.46e-01 |
| copd | +0.51 | 1.707 | 7.64e-01 |
| chronic_physical | -1.42 | 0.918 | 1.22e-01 |
| walking_speed_mps | +41.09 | 2.142 | 0.00e+00 |
| dist_nearest_shelter_km | +57.54 | 0.712 | 0.00e+00 |

Retry behaviour: 45,811 residents were refused at a full door at least once; 6.6% of them still got inside somewhere else (mean stops among the refused: 3.42).

## Arm B — logistic: P(sheltered), n=61,307 (9 seeds pooled; unreachable excluded), share sheltered 0.919
McFadden pseudo-R2 = 0.472; in-sample accuracy = 0.938

| feature | coef | odds ratio | SE | p |
|---|---|---|---|---|
| intercept | -4.7488 |  | 0.1329 | 0.00e+00 |
| age_55plus | -0.1049 | 0.900 | 0.0406 | 9.78e-03 |
| female | -0.0593 | 0.942 | 0.0421 | 1.58e-01 |
| sex_other | -0.0805 | 0.923 | 0.1311 | 5.39e-01 |
| mobility_limited | +0.0630 | 1.065 | 0.0524 | 2.29e-01 |
| asthma | +0.0884 | 1.092 | 0.0548 | 1.07e-01 |
| copd | -0.2285 | 0.796 | 0.0532 | 1.76e-05 |
| chronic_physical | +0.0146 | 1.015 | 0.0402 | 7.17e-01 |
| walking_speed_mps | +8.0131 | 3020.371 | 0.1158 | 0.00e+00 |
| dist_nearest_shelter_km | -0.8589 | 0.424 | 0.0178 | 0.00e+00 |

### OLS: travel_time_min among sheltered (n=56,340), R2 = 0.299
| feature | coef (min) | SE | p |
|---|---|---|---|
| intercept | +137.73 | 3.355 | 0.00e+00 |
| age_55plus | +2.22 | 1.099 | 4.30e-02 |
| female | +0.60 | 1.033 | 5.58e-01 |
| sex_other | -3.03 | 3.136 | 3.34e-01 |
| mobility_limited | -9.24 | 1.449 | 1.84e-10 |
| asthma | +0.34 | 1.294 | 7.94e-01 |
| copd | -0.29 | 1.593 | 8.54e-01 |
| chronic_physical | -0.20 | 0.946 | 8.32e-01 |
| walking_speed_mps | -109.56 | 2.309 | 0.00e+00 |
| dist_nearest_shelter_km | +69.63 | 0.467 | 0.00e+00 |

Retry behaviour: 24,044 residents were refused at a full door at least once; 79.3% of them still got inside somewhere else (mean stops among the refused: 3.10).

## Arm C — logistic: P(sheltered), n=61,307 (9 seeds pooled; unreachable excluded), share sheltered 0.964
McFadden pseudo-R2 = 0.477; in-sample accuracy = 0.966

| feature | coef | odds ratio | SE | p |
|---|---|---|---|---|
| intercept | -3.1338 |  | 0.1754 | 0.00e+00 |
| age_55plus | -0.1905 | 0.827 | 0.0546 | 4.80e-04 |
| female | -0.0434 | 0.958 | 0.0585 | 4.59e-01 |
| sex_other | -0.2519 | 0.777 | 0.1753 | 1.51e-01 |
| mobility_limited | -0.1965 | 0.822 | 0.0807 | 1.49e-02 |
| asthma | -0.0187 | 0.981 | 0.0745 | 8.02e-01 |
| copd | -0.2212 | 0.802 | 0.0761 | 3.64e-03 |
| chronic_physical | +0.0503 | 1.052 | 0.0553 | 3.63e-01 |
| walking_speed_mps | +7.7767 | 2384.349 | 0.1539 | 0.00e+00 |
| dist_nearest_shelter_km | -0.9213 | 0.398 | 0.0272 | 0.00e+00 |

### OLS: travel_time_min among sheltered (n=59,094), R2 = 0.198
| feature | coef (min) | SE | p |
|---|---|---|---|
| intercept | +110.05 | 2.998 | 0.00e+00 |
| age_55plus | +1.06 | 1.000 | 2.89e-01 |
| female | +0.15 | 0.944 | 8.71e-01 |
| sex_other | +1.28 | 2.881 | 6.58e-01 |
| mobility_limited | -5.24 | 1.306 | 6.01e-05 |
| asthma | +2.29 | 1.187 | 5.33e-02 |
| copd | +2.45 | 1.436 | 8.83e-02 |
| chronic_physical | +1.52 | 0.867 | 8.07e-02 |
| walking_speed_mps | -85.28 | 2.052 | 0.00e+00 |
| dist_nearest_shelter_km | +60.54 | 0.538 | 0.00e+00 |

Retry behaviour: 25,519 residents were refused at a full door at least once; 91.3% of them still got inside somewhere else (mean stops among the refused: 2.39).

## Arm D — logistic: P(sheltered), n=20,426 (9 seeds pooled; unreachable excluded), share sheltered 0.920
McFadden pseudo-R2 = 0.409; in-sample accuracy = 0.930

| feature | coef | odds ratio | SE | p |
|---|---|---|---|---|
| intercept | -8.8923 |  | 0.2730 | 0.00e+00 |
| age_55plus | +0.1099 | 1.116 | 0.0710 | 1.22e-01 |
| female | -0.0163 | 0.984 | 0.0674 | 8.09e-01 |
| sex_other | +0.2409 | 1.272 | 0.2282 | 2.91e-01 |
| mobility_limited | +4.8112 | 122.883 | 0.1428 | 0.00e+00 |
| asthma | +0.1144 | 1.121 | 0.0912 | 2.10e-01 |
| copd | -0.0420 | 0.959 | 0.0844 | 6.19e-01 |
| chronic_physical | -0.0507 | 0.951 | 0.0652 | 4.37e-01 |
| walking_speed_mps | +10.5469 | 38059.987 | 0.2393 | 0.00e+00 |
| dist_nearest_shelter_km | -0.9519 | 0.386 | 0.0296 | 0.00e+00 |

### OLS: travel_time_min among sheltered (n=18,783), R2 = 0.276
| feature | coef (min) | SE | p |
|---|---|---|---|
| intercept | +143.75 | 5.995 | 0.00e+00 |
| age_55plus | -0.44 | 1.968 | 8.23e-01 |
| female | +0.98 | 1.864 | 5.98e-01 |
| sex_other | +2.37 | 5.613 | 6.73e-01 |
| mobility_limited | -24.70 | 2.580 | 0.00e+00 |
| asthma | +1.22 | 2.330 | 6.02e-01 |
| copd | -4.48 | 2.926 | 1.25e-01 |
| chronic_physical | +1.46 | 1.702 | 3.91e-01 |
| walking_speed_mps | -110.25 | 4.107 | 0.00e+00 |
| dist_nearest_shelter_km | +69.55 | 0.853 | 0.00e+00 |

Retry behaviour: 8,078 residents were refused at a full door at least once; 79.7% of them still got inside somewhere else (mean stops among the refused: 3.27).

## Negative control (honesty check)
Asthma and chronic-physical coefficients must be null in arms A-C: no mechanism links them to movement (no gait-speed evidence exists), so a significant coefficient would mean the model invented an effect. Mobility, COPD (via -0.19 m/s), speed, and distance are the built-in mechanisms and should carry the signal. In arm D the mobility coefficient must FLIP toward positive: the triage reserve is the only channel that privileges mobility-limited arrivals.
