import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBlock(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.conv(x)


class LTAE(nn.Module):
    def __init__(self, in_channels, n_head=8, d_model=128, d_k=16):
        super().__init__()
        self.d_k = d_k
        self.n_head = n_head
        self.in_channels = in_channels

        self.q_proj = nn.Linear(in_channels, d_model)
        self.k_proj = nn.Linear(in_channels, d_model)
        self.v_proj = nn.Linear(in_channels, d_model)

        self.temporal_enc = nn.Linear(1, d_model)

    def forward(self, x, batch_dates):
        B, T, C, H, W = x.shape
        x_flat = x.view(B, T, C, -1).mean(dim=-1)

        time_feats = self.temporal_enc(batch_dates.unsqueeze(-1))

        q = self.q_proj(x_flat) + time_feats
        k = self.k_proj(x_flat) + time_feats
        v = self.v_proj(x_flat)

        q = q.view(B, T, self.n_head, -1).transpose(1, 2)
        k = k.view(B, T, self.n_head, -1).transpose(1, 2)
        v = v.view(B, T, self.n_head, -1).transpose(1, 2)

        attn = torch.matmul(q, k.transpose(-2, -1)) / (self.d_k ** 0.5)
        attn = torch.softmax(attn, dim=-1)

        out = torch.matmul(attn, v)
        out = out.transpose(1, 2).contiguous().view(B, T, -1)

        temporal_weights = out.mean(dim=-1)
        return temporal_weights


class UTAE(nn.Module):
    def __init__(self, in_channels=10, n_classes=1):
        super().__init__()
        self.enc1 = ConvBlock(in_channels, 64)
        self.enc2 = ConvBlock(64, 128)
        self.pool = nn.MaxPool2d(2)

        self.ltae = LTAE(in_channels=128, n_head=4, d_model=128)

        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.dec1 = ConvBlock(128 + 64, 64)
        self.final = nn.Conv2d(64, n_classes, kernel_size=1)

    def forward(self, x, batch_dates):
        B, T, C, H, W = x.shape

        x = x.view(B * T, C, H, W)

        s1 = self.enc1(x)
        s2 = self.enc2(self.pool(s1))

        _, _, _, H2, W2 = s2.view(B, T, 128, H // 2, W // 2).shape
        feat_for_attn = s2.view(B, T, 128, H2, W2)
        weights = self.ltae(feat_for_attn, batch_dates)

        weights = weights.view(B, T, 1, 1, 1)
        temporal_aggregated = (feat_for_attn * weights).sum(dim=1)

        s1_mean = s1.view(B, T, 64, H, W).mean(dim=1)

        d1 = self.up(temporal_aggregated)
        d1 = torch.cat([d1, s1_mean], dim=1)

        out = self.dec1(d1)
        return self.final(out)


class AgriculturalSegmentationModel(nn.Module):
    def __init__(self, n_channels=10, n_classes=1):
        super().__init__()
        self.model = UTAE(
            in_channels=n_channels,
            n_classes=n_classes
        )

    def forward(self, x, batch_dates):
        return self.model(x, batch_dates)