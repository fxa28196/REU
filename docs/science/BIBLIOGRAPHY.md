# Bibliography

Every source consulted for this model, with DOI where available and
BibTeX-ready entries. Sources are marked by how they are used:

- **[IMPLEMENTED]** — a value from this source is in the code today
- **[SPECIFIED]** — designated for use in a planned component
- **[EVALUATED]** — read and assessed; used for context or explicitly rejected
- **[⚠️ DISPUTED]** — cited by the project slides but **not verified**; see notes

Verified against primary sources on **2026-07-24** unless noted. Where a claim
could not be verified, that is stated rather than smoothed over.

---

## 1. Exposure science and geodesy

### Karney (2013) — **[IMPLEMENTED]**
Geodesic algorithms used for all distance/movement arithmetic (GeographicLib-Java
1.49, bundled with Repast Simphony 2.11).

> Karney, C. F. F. (2013). Algorithms for geodesics. *Journal of Geodesy*,
> 87(1), 43–55. DOI: [10.1007/s00190-012-0578-z](https://doi.org/10.1007/s00190-012-0578-z)

```bibtex
@article{karney2013geodesics,
  author  = {Karney, Charles F. F.},
  title   = {Algorithms for geodesics},
  journal = {Journal of Geodesy},
  volume  = {87}, number = {1}, pages = {43--55}, year = {2013},
  doi     = {10.1007/s00190-012-0578-z}
}
```

### Dijkstra (1959) — **[IMPLEMENTED]**
Shortest-path algorithm underlying shelter accessibility (V11).

> Dijkstra, E. W. (1959). A note on two problems in connexion with graphs.
> *Numerische Mathematik*, 1(1), 269–271. DOI: [10.1007/BF01386390](https://doi.org/10.1007/BF01386390)

```bibtex
@article{dijkstra1959note,
  author  = {Dijkstra, E. W.},
  title   = {A note on two problems in connexion with graphs},
  journal = {Numerische Mathematik},
  volume  = {1}, number = {1}, pages = {269--271}, year = {1959},
  doi     = {10.1007/BF01386390}
}
```

---

## 2. Mobility

### Bohannon (1997) — **[IMPLEMENTED, PROVISIONAL]**
Source for `walkingSpeedMps = 1.30`. Reported mean comfortable gait speeds
range 127.2 cm/s (women, 8th decade) to 146.2 cm/s (men, 5th decade).
**Limitation:** healthy-adult cohort; not specific to unhoused adults.

> Bohannon, R. W. (1997). Comfortable and maximum walking speed of adults aged
> 20–79 years: reference values and determinants. *Age and Ageing*, 26(1), 15–19.
> DOI: [10.1093/ageing/26.1.15](https://doi.org/10.1093/ageing/26.1.15)

```bibtex
@article{bohannon1997walking,
  author  = {Bohannon, Richard W.},
  title   = {Comfortable and maximum walking speed of adults aged 20--79 years:
             reference values and determinants},
  journal = {Age and Ageing},
  volume  = {26}, number = {1}, pages = {15--19}, year = {1997},
  doi     = {10.1093/ageing/26.1.15}
}
```

---

## 3. PM2.5 health effects

### Di et al. (2017) — **[⚠️ DISPUTED as cited / SPECIFIED for correct use]**

**Verified effect estimates** (checked against the full text, 2026-07-24):
HR **1.073** (95% CI 1.071–1.075) per 10 µg/m³ increase in **annual** PM2.5,
all-cause mortality; HR 1.136 (1.131–1.141) when restricted to PM2.5 < 12 µg/m³.
Cohort: 60,925,443 Medicare beneficiaries, **all aged 65+**, 2000–2012.

⚠️ **The project slides attribute an RR of ×1.45 for adults 65+ to this paper.
That value does not appear in it, and the study design cannot produce an
age-contrast multiplier because every subject is 65+.** See DATA_SOURCES.md D5.
The defensible use of this paper is its per-10 µg/m³ hazard ratio as a
concentration–response function.

> Di, Q., Wang, Y., Zanobetti, A., Wang, Y., Koutrakis, P., Choirat, C.,
> Dominici, F., & Schwartz, J. D. (2017). Air Pollution and Mortality in the
> Medicare Population. *New England Journal of Medicine*, 376(26), 2513–2522.
> DOI: [10.1056/NEJMoa1702747](https://doi.org/10.1056/NEJMoa1702747)

```bibtex
@article{di2017air,
  author  = {Di, Qian and Wang, Yan and Zanobetti, Antonella and Wang, Yun and
             Koutrakis, Petros and Choirat, Christine and Dominici, Francesca and
             Schwartz, Joel D.},
  title   = {Air Pollution and Mortality in the {Medicare} Population},
  journal = {New England Journal of Medicine},
  volume  = {376}, number = {26}, pages = {2513--2522}, year = {2017},
  doi     = {10.1056/NEJMoa1702747}
}
```

### Anderson, Thundiyil & Stolbach (2012) — **[⚠️ DISPUTED / EVALUATED]**

The slides cite *"Anderson et al. 2013"* for a COPD RR of ×1.80. **No such 2013
paper could be located.** The nearest match is this **2012** narrative review,
which is not a source of a COPD-specific RR of 1.80. The ×1.80 value is
therefore **unverified** and must not be coded on this citation.

> Anderson, J. O., Thundiyil, J. G., & Stolbach, A. (2012). Clearing the Air:
> A Review of the Effects of Particulate Matter Air Pollution on Human Health.
> *Journal of Medical Toxicology*, 8(2), 166–175.
> DOI: [10.1007/s13181-011-0203-1](https://doi.org/10.1007/s13181-011-0203-1)

```bibtex
@article{anderson2012clearing,
  author  = {Anderson, Jonathan O. and Thundiyil, Josef G. and Stolbach, Andrew},
  title   = {Clearing the Air: A Review of the Effects of Particulate Matter
             Air Pollution on Human Health},
  journal = {Journal of Medical Toxicology},
  volume  = {8}, number = {2}, pages = {166--175}, year = {2012},
  doi     = {10.1007/s13181-011-0203-1}
}
```

---

## 4. Wildfire smoke specifically

### Reid et al. (2016) — **[SPECIFIED]**
The standard critical review of wildfire smoke health impacts; documents
consistent associations with **asthma and COPD exacerbations**. Correct exposure
context (wildfire smoke, not generic urban PM2.5). Effect estimates to be
extracted from full text for RR sourcing.

> Reid, C. E., Brauer, M., Johnston, F. H., Jerrett, M., Balmes, J. R., &
> Elliott, C. T. (2016). Critical Review of Health Impacts of Wildfire Smoke
> Exposure. *Environmental Health Perspectives*, 124(9), 1334–1343.
> DOI: [10.1289/ehp.1409277](https://doi.org/10.1289/ehp.1409277)

```bibtex
@article{reid2016critical,
  author  = {Reid, Colleen E. and Brauer, Michael and Johnston, Fay H. and
             Jerrett, Michael and Balmes, John R. and Elliott, Catherine T.},
  title   = {Critical Review of Health Impacts of Wildfire Smoke Exposure},
  journal = {Environmental Health Perspectives},
  volume  = {124}, number = {9}, pages = {1334--1343}, year = {2016},
  doi     = {10.1289/ehp.1409277}
}
```

### DeFlorio-Barker et al. (2019) — **[SPECIFIED]**
Older adults, smoke days vs non-smoke days, US 2008–2010. Finds **asthma**
hospitalisation risk elevated on smoke days while general cardiopulmonary risk
was similar across smoke/non-smoke days — a distinction the model should
preserve rather than collapse into a single respiratory multiplier.

> DeFlorio-Barker, S., Crooks, J., Reyes, J., & Rappold, A. G. (2019).
> Cardiopulmonary Effects of Fine Particulate Matter Exposure among Older
> Adults, during Wildfire and Non-Wildfire Periods, in the United States
> 2008–2010. *Environmental Health Perspectives*, 127(3), 37006.
> DOI: [10.1289/EHP3860](https://doi.org/10.1289/EHP3860)

```bibtex
@article{deflorio2019cardiopulmonary,
  author  = {DeFlorio-Barker, Stephanie and Crooks, James and Reyes, Jeanette and
             Rappold, Ana G.},
  title   = {Cardiopulmonary Effects of Fine Particulate Matter Exposure among
             Older Adults, during Wildfire and Non-Wildfire Periods, in the
             United States 2008--2010},
  journal = {Environmental Health Perspectives},
  volume  = {127}, number = {3}, pages = {37006}, year = {2019},
  doi     = {10.1289/EHP3860}
}
```

---

## 5. Health of people experiencing homelessness

### Fazel, Geddes & Kushel (2014) — **[SPECIFIED]**
Authoritative synthesis of the health burden of homelessness in high-income
countries; basis for justifying elevated comorbidity prevalence relative to the
housed population.

> Fazel, S., Geddes, J. R., & Kushel, M. (2014). The health of homeless people
> in high-income countries: descriptive epidemiology, health consequences, and
> clinical and policy recommendations. *The Lancet*, 384(9953), 1529–1540.
> DOI: [10.1016/S0140-6736(14)61132-6](https://doi.org/10.1016/S0140-6736(14)61132-6)

```bibtex
@article{fazel2014health,
  author  = {Fazel, Seena and Geddes, John R. and Kushel, Margot},
  title   = {The health of homeless people in high-income countries:
             descriptive epidemiology, health consequences, and clinical and
             policy recommendations},
  journal = {The Lancet},
  volume  = {384}, number = {9953}, pages = {1529--1540}, year = {2014},
  doi     = {10.1016/S0140-6736(14)61132-6}
}
```

### Snyder & Eisner (2004) — **[SPECIFIED, small n]**
Spirometry-confirmed obstructive lung disease prevalence in an urban homeless
population (San Francisco shelter, **n = 68**). Population-appropriate but small,
single-site, and two decades before the study event.

> Snyder, L. D., & Eisner, M. D. (2004). Obstructive Lung Disease Among the
> Urban Homeless. *Chest*, 125(5), 1719–1725.
> DOI: [10.1378/chest.125.5.1719](https://doi.org/10.1378/chest.125.5.1719)

```bibtex
@article{snyder2004obstructive,
  author  = {Snyder, Laurie D. and Eisner, Mark D.},
  title   = {Obstructive Lung Disease Among the Urban Homeless},
  journal = {Chest},
  volume  = {125}, number = {5}, pages = {1719--1725}, year = {2004},
  doi     = {10.1378/chest.125.5.1719}
}
```

---

## 6. Datasets and government sources

### EPA Air Quality System — **[IMPLEMENTED — data acquired]**

> U.S. Environmental Protection Agency. *Air Quality System (AQS) pre-generated
> data files: hourly PM2.5 (parameter 88502), 2020.* Retrieved 2026-07-24 from
> https://aqs.epa.gov/aqsweb/airdata/download_files.html

```bibtex
@misc{epa2020aqs,
  author = {{U.S. Environmental Protection Agency}},
  title  = {Air Quality System (AQS) Pre-Generated Data Files:
            Hourly {PM2.5} (Parameter 88502), 2020},
  year   = {2020}, note = {Retrieved 2026-07-24},
  url    = {https://aqs.epa.gov/aqsweb/airdata/download_files.html}
}
```

### EPA AQI Technical Assistance Document — **[SPECIFIED]**
Defines the PM2.5 AQI breakpoints (Unhealthy ≥ 55.5 µg/m³, 24-h average) and the
NowCast algorithm. ⚠️ Breakpoints above "Unhealthy" were revised 2024-05-06 —
cite the table version used.

> U.S. Environmental Protection Agency. *Technical Assistance Document for the
> Reporting of Daily Air Quality — the Air Quality Index (AQI).*
> https://www.airnow.gov/publications/air-quality-index/technical-assistance-document-for-reporting-the-daily-aqi/

### Multnomah County Joint Office of Homeless Services — **[SPECIFIED]**
Primary record of the September 2020 smoke-respite shelter response
(nine consecutive days, 2020-09-10 → morning of 2020-09-19).

> Multnomah County Joint Office of Homeless Services. *Smoke, dangerous air
> prompt Joint Office of Homeless Services to open extra shelter capacity, take
> other protective steps.* News release, 2020-09-10.
> https://www.multco.us/multnomah-county/news/smoke-dangerous-air-prompt-joint-office-homeless-services-open-extra-shelter
>
> — *Friday, Sept. 18: Joint Office offers 9th day of smoke shelter, likely the
> last day for now.* News release, 2020-09-18.

### Portland State University Regional Research Institute — **[SPECIFIED]**
2019 Point-in-Time count: 4,015 people experiencing homelessness; **2,037
unsheltered**; count night 2019-01-23.

> Regional Research Institute for Human Services, Portland State University.
> *2019 Point-in-Time Count of Homelessness in Portland/Gresham/Multnomah
> County, Oregon.* PDXScholar. https://pdxscholar.library.pdx.edu/rri_facpubs/63/

### CDC PLACES — **[SPECIFIED]**
Census-tract COPD and current-asthma prevalence (BRFSS small-area estimates).
⚠️ Models the housed general adult population; a lower bound for this study.

> Centers for Disease Control and Prevention. *PLACES: Local Data for Better
> Health.* https://www.cdc.gov/places/

### CDC/ATSDR Social Vulnerability Index — **[SPECIFIED, validation use]**

> Agency for Toxic Substances and Disease Registry. *CDC/ATSDR Social
> Vulnerability Index (SVI) 2020 Database.*
> https://www.atsdr.cdc.gov/place-health/php/svi/

### EPA EJScreen — **[SPECIFIED, validation use]**

> U.S. Environmental Protection Agency. *EJScreen: Environmental Justice
> Screening and Mapping Tool.* https://www.epa.gov/ejscreen

---

## 7. Corroborating journalism (not used as a source of values)

> Pollard, J. (2020, September 16). *Portland's houseless face health risks
> amidst toxic air, trouble accessing resources.* Street Roots.
> https://www.streetroots.org/news-stories/2020/09/16/homeless-portland-amid-wildfire-smoke/

Used only to reconstruct shelter site names and capacities pending confirmation
from a primary government record (DATA_SOURCES D1). Any capacity figure that
reaches the model must carry this provisional status until confirmed.

---

## Recommended citation for this model

> Asghar, F. (2026). *Wildfire Smoke Shelter Placement Agent-Based Model*
> (Version 0.1) [Computer software]. NSF Research Experience for
> Undergraduates, Portland State University.
> https://github.com/fxa28196/REU

A `CITATION.cff` file and Zenodo DOI are scheduled for roadmap commit 16.


---

## Sources of the implemented Phase-2 parameters

Added 2026-07-26. Every source below backs a parameter that is live in the final
runs. Previously this file documented only the superseded uniform walking speed,
which meant the citation registry was a generation behind the model.

- **Bohannon RW & Williams Andrews A (2011).** Normal walking speed: a
  descriptive meta-analysis. *Physiotherapy* 97(3):182–189.
  DOI [10.1016/j.physio.2010.12.004](https://doi.org/10.1016/j.physio.2010.12.004).
  41 studies, n = 23,111. → age × sex comfortable gait means (V10 revised).

- **Bohannon RW (1997).** Comfortable and maximum walking speed of adults aged
  20–79 years: reference values and determinants. *Age and Ageing* 26(1):15–19.
  DOI [10.1093/ageing/26.1.15](https://doi.org/10.1093/ageing/26.1.15).
  → within-population coefficient of variation 0.13.

- **Boyce KE, Shields TJ & Silcock GWH (1999).** Toward the characterization of
  building occupancies for fire safety engineering: capabilities of disabled
  people moving horizontally. *Fire Technology* 35(1):51–67.
  DOI [10.1023/A:1015339216366](https://doi.org/10.1023/A:1015339216366).
  **VERIFIED-IN-SECONDARY** via Tinaburri (2018), FEMTC proceedings.
  → mobility-limited movement speed N(0.95, 0.32) m/s (V20).

- **Buekers J, et al. (2024).** Gait differences between COPD and healthy
  controls: systematic review and meta-analysis. *European Respiratory Review*
  33(172):230253.
  DOI [10.1183/16000617.0253-2023](https://doi.org/10.1183/16000617.0253-2023).
  PMID 38657998. 25 studies, 1,015 people with COPD vs 2,229 healthy controls;
  usual gait speed −19 cm/s (95% CI −28 to −11); evidence rated **low** by the
  authors. → COPD walking-speed decrement (V24).

- **Zellmer S, et al. (2025).** *Journal of General Internal Medicine*.
  DOI [10.1007/s11606-025-09814-x](https://doi.org/10.1007/s11606-025-09814-x).
  n = 20,139 adults with recent homelessness, EHR-diagnosed.
  → asthma 0.15, COPD 0.105 (V21a, V21b).

- **U.S. EPA (2011).** *Exposure Factors Handbook: 2011 Edition*, Chapter 6:
  Inhalation Rates. EPA/600/R-09/052F. **VERIFIED-IN-SECONDARY.**
  → activity-level ventilation rates, walking 1.62 m³/h and resting 0.61 m³/h
  (V25), both carried with sweep ranges.

- **UCSF Benioff Homelessness and Housing Initiative (2023).** *Toward a New
  Understanding: the California Statewide Study of People Experiencing
  Homelessness.* n = 3,198. → mobility-limitation age gradient (A-18).

- **Brown RT, et al. (2017).** *The Gerontologist*.
  DOI [10.1093/geront/gnw011](https://doi.org/10.1093/geront/gnw011).
  Homeless adults aged 50+, n = 350; asthma-or-COPD 26.3%. → evidence that
  respiratory prevalence has no material age gradient in this population, which
  justifies sampling V21a/V21b independently of age.

- **Lewer D, et al. (2019).** *BMJ Open*.
  DOI [10.1136/bmjopen-2018-025192](https://doi.org/10.1136/bmjopen-2018-025192).
  n = 1,336. → self-report upper bound bracketing asthma/COPD prevalence.

- **Alman BL, et al. (2016).** *Environmental Health* 15:64.
  DOI [10.1186/s12940-016-0146-8](https://doi.org/10.1186/s12940-016-0146-8).
  → context for respiratory susceptibility during smoke; explicitly **not** used
  as a per-agent multiplier (population-rate estimate).

- **DeFlorio-Barker S, et al. (2019).** *Environmental Health Perspectives*
  127(3):037006. DOI [10.1289/EHP3860](https://doi.org/10.1289/EHP3860).
  → same role and same exclusion.

- **Portland State University.** *Stories from the Outside* (n = 73). → the local
  finding that 65% of surveyed unsheltered residents had never heard of the
  clean-air shelters; the basis for treating modelled uptake as an upper bound
  (A-12).

- **Street Roots, 16 September 2020.** → observed shelter occupancy
  (~130 of 198 beds) and the 99-bed capacity figure (D14, A-04).
