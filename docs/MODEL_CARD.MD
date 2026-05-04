## Segmentation Model Performance Metrics

Below are the key characteristics and performance indicators for the models used in segmentation.

| Model Name         | Dataset | Loss                    | Metric (Dice)     | Metric (IoU) | Notes          |
|:-------------------|:--------|:------------------------|:------------------| :--- |:---------------|
| **U-NET**          |AI4Boundaries| BCEDiceLoss             | 0.4786            | 0.3449 | Baseline model |
| **U-NET + MiT-B2** |AI4Boundaries| LovaszLoss+BCEDiceLoss+DiceLoss | 0.5348            | 0.4018 | v 12.0         |
| **U-TAE**          |PASTIS | BCEDiceLoss | 0.8453                 | 0.7563 | v 1.0          |
---
