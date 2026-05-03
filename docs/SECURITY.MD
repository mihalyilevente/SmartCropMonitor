# Security Policy

## 1. Supported Versions

We provide security updates only for actively maintained versions.

| Version   | Supported |
|-----------| --------- |
| > v1.0.x  | Yes       |
| <= v1.0.0 | No        |

If you are using an unsupported version, upgrade before reporting issues.

---

## 2. Reporting a Vulnerability

**Do NOT open public issues for security vulnerabilities.**

Instead:

* Send a report via private channel (email or direct contact if defined)
* Provide detailed technical information (see below)

---

### Required Information

Include:

* Description of the vulnerability
* Steps to reproduce
* Affected components:

  * ingestion pipeline
  * validation service (Haskell)
  * ML pipeline
* Impact assessment:

  * data corruption
  * incorrect validation
  * model manipulation
* Proof of concept (if possible)

Example:

```md
## Vulnerability
Incorrect cloud ratio calculation allows invalid Sentinel-2 data to pass validation.

## Steps
1. Input SCL layer with mislabeled cloud class
2. Validation returns cloud_ratio < threshold

## Impact
Model is trained on corrupted data
```

---

## 3. Scope

This policy covers:

### 3.1 Data Pipeline

* Data ingestion
* Preprocessing
* Config parsing

### 3.2 Validation Layer (Haskell)

* Cloud detection logic
* NaN filtering
* Radiometric checks

### 3.3 ML Components

* Training pipeline
* Inference logic
* Model serialization/deserialization

---

## 4. Security Risks Specific to This Project

### 4.1 Data Poisoning

* Malicious or corrupted satellite data
* Incorrect labels (SCL manipulation)

Mitigation:

* Strict validation thresholds
* Cross-checking statistics

---

### 4.2 Configuration Injection

* Unsafe parsing of config files (YAML/JSON)

Mitigation:

* Validate schema
* Avoid dynamic execution

---

### 4.3 Model Integrity Risks

* Loading untrusted model weights
* Silent degradation of metrics

Mitigation:

* Checksum verification
* Explicit metric validation

---

### 4.4 Numerical Instability

* NaN propagation
* Overflow/underflow in preprocessing

Mitigation:

* Explicit NaN checks
* Clipping and normalization

---

## 5. Sensitive Areas

Changes in the following areas require careful review:

* Validation thresholds (cloud_ratio, nan_ratio)
* Data filtering logic
* Model input preprocessing
* Serialization/deserialization code

---

## 6. Dependency Management

* Keep dependencies minimal
* Regularly update:

  * Python packages
  * Haskell libraries
* Avoid unverified third-party code

---

## 7. Secrets and Credentials

* Do NOT commit:

  * API keys
  * Tokens
  * Credentials

Use environment variables or secure storage.

---

## 8. Responsible Disclosure

* Reports will be acknowledged within **72 hours**
* Fix timeline depends on severity
* Contributors reporting valid vulnerabilities will be credited (if desired)

---

## 9. Out of Scope

The following are NOT considered security issues:

* Low-quality model performance
* Expected numerical noise in ML outputs
* Minor visualization inconsistencies

---

## 10. Best Practices for Contributors

* Validate all external inputs
* Avoid implicit assumptions about data
* Prefer explicit checks over silent failure
* Log critical steps in pipeline

---

## 11. Contact

Define a contact channel:


Security contact: nick.manaenkov@gmail.com

---
