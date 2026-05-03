# Contributing

## 1. Overview

Thank you for considering contributing to this project.

This repository focuses on:

* satellite imagery processing
* validation pipelines (Haskell services)
* ML models (U-Net, segmentation)
* data ingestion and preprocessing

Contributions are expected to be technically sound, reproducible, and aligned with project architecture.

---

## 2. Contribution Types

We accept:

* Bug fixes
* Feature implementations
* Performance improvements
* Refactoring (with justification)
* Documentation improvements
* ML experiments (must be reproducible)

We do **not** accept:

* Unverified heuristics
* “Black box” ML changes without explanation
* Breaking changes without discussion

---

## 3. Workflow

### 3.1 Fork & Branch

```bash
git checkout -b feat/<short-description>
```

Examples:

* `feat/cloud-mask-validation`
* `fix/scl-threshold-bug`
* `refactor/ingestion-pipeline`

---

### 3.2 Commit Convention

Use structured commits:

```bash
type(scope): short description
```

Examples:

```bash
feat(validation): add Haskell-based SCL cloud ratio computation
fix(ml): correct normalization for Sentinel-2 input
refactor(pipeline): decouple ingestion and validation stages
```

Recommended types:

* `feat`
* `fix`
* `refactor`
* `docs`
* `test`

---

Понял задачу: ты хочешь не дублировать правила, а **сослаться на основной документ**, чтобы не было расхождения стандартов.

Ниже — корректная замена секции.

---

## 4. Code Standards

All code standards are defined in the main project documentation:

> Refer to: **`docs/CODE_OF_CONDUCT.md`**

This includes:

* General engineering principles (determinism, data flow)
* Python standards (PEP8, typing, config-driven execution)
* Haskell standards (pure functions, strong typing)
* Validation logic constraints
* ML and pipeline requirements

---

## 5. Machine Learning Contributions

All ML-related contributions must include:

### Required:

* Dataset description
* Preprocessing steps
* Training configuration
* Metrics (Dice, IoU, etc.)
* Reproducibility instructions

### Optional but recommended:

* Notebooks (cleaned)
* Visualization of results

Bad example:

> “Model improved performance”

Good example:

> “Dice improved from 0.38 → 0.50 on AI4Boundaries validation set”

---

## 6. Data & Validation Rules

* Satellite data must be validated before use
* Cloud contamination must be quantified
* NaN ratio must be controlled

If adding new validation:

* Provide mathematical justification
* Show thresholds and reasoning

---

## 7. Pull Request Requirements

Each PR must include:

* Description of changes
* Motivation (why this matters)
* Impact on pipeline
* Example output or logs

Template:

```md
## What
Short description

## Why
Reason for change

## How
Technical explanation

## Results
Metrics / logs / screenshots
```

---

## 8. Testing

* All critical logic must be testable
* Add tests for:

  * validation functions
  * data transformations
  * edge cases

---

## 9. Configuration

* Do not hardcode parameters
* Use config files for:

  * model settings
  * thresholds
  * paths

---

## 10. Discussion Before Major Changes

Open an issue before:

* Changing architecture
* Replacing models
* Modifying validation logic

---

## 11. Style & Clarity

* Avoid overengineering
* Prefer clarity over cleverness
* Document non-trivial logic

---

## 12. Questions

If something is unclear — open an issue before implementing.

---
