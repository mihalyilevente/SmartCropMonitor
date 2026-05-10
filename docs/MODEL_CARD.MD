## Segmentation Model Performance Metrics

Below are the key characteristics and performance indicators for the models used in segmentation.

| Model Name         | Dataset | Loss                    | Metric (Dice)           | Metric (IoU)     | Notes          |
|:-------------------|:--------|:------------------------|:------------------------|:-----------------|:---------------|
| **U-NET**          |AI4Boundaries| BCEDiceLoss             | 0.4786                  | 0.3449           | Baseline model |
| **U-NET + MiT-B2** |AI4Boundaries| LovaszLoss+BCEDiceLoss+DiceLoss | 0.5346                  | 0.4033           | v 15.0         |
| **DeepLabV3 + MiT-B2** |AI4Boundaries| LovaszLoss+BCEDiceLoss+DiceLoss | 0.4443                 | 0.3230         | v 6.0          |
| **U-TAE**          |PASTIS | BCEDiceLoss | 0.8597                  | 0.7763           | v 6.0          |
| **U-ConvLSTM**     |PASTIS | BCEDiceLoss | 0.8505                  | 0.7658           | v 1.0          |
| **U-ConvLTC**      |PASTIS | BCEDiceLoss | 0.8460                       | 0.7615                | v 2.0          |
---


## References

### Papers

* Panoptic Segmentation of Satellite Image Time Series with Convolutional Temporal Attention Networks
  Vivien Sainte Fare Garnot, Loic Landrieu.
  *Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV), 2021.*

```bibtex
@inproceedings{garnot2021panoptic,
  title={Panoptic Segmentation of Satellite Image Time Series with Convolutional Temporal Attention Networks},
  author={Sainte Fare Garnot, Vivien and Landrieu, Loic},
  booktitle={Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV)},
  year={2021}
}
```

---

### Datasets

* AI4Boundaries Dataset
  European Commission, Joint Research Centre (JRC), 2026.
  DOI: `10.2905/JRC.ENFKDWG`
  PID: [http://data.europa.eu/89h/0e79ce5d-e4c8-4721-8773-59a4acf2c9c9](http://data.europa.eu/89h/0e79ce5d-e4c8-4721-8773-59a4acf2c9c9)

```bibtex
@dataset{ai4boundaries2026,
  author = {{European Commission, Joint Research Centre}},
  title = {AI4Boundaries},
  year = {2026},
  doi = {10.2905/JRC.ENFKDWG},
  url = {http://data.europa.eu/89h/0e79ce5d-e4c8-4721-8773-59a4acf2c9c9}
}
```

* PASTIS Dataset
  Garnot et al., 2021

```bibtex
@article{garnot2021pastis,
  title={PASTIS: A Dataset for Panoptic Segmentation of Satellite Image Time Series},
  author={Sainte Fare Garnot, Vivien and Landrieu, Loic},
  year={2021}
}
```

---
