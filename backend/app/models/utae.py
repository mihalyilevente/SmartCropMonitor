import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBlock(nn.Module):
    def __init__(self, in_channels, out_channels, dropout=0.1):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.GELU(),
            nn.Dropout2d(dropout),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.GELU(),
        )
        self.shortcut = nn.Conv2d(in_channels, out_channels, 1) \
            if in_channels != out_channels else nn.Identity()

    def forward(self, x):
        return self.conv(x) + self.shortcut(x)


class SpatialLTAE(nn.Module):
    def __init__(self, in_channels, n_head=8, d_k=32):
        super().__init__()
        self.n_head = n_head
        self.d_k = d_k
        d_model = n_head * d_k

        self.master_query = nn.Parameter(torch.randn(1, n_head, d_k))

        self.k_proj = nn.Linear(in_channels, d_model)
        self.v_proj = nn.Linear(in_channels, d_model)

        self.temporal_mlp = nn.Sequential(
            nn.Linear(1, 32),
            nn.GELU(),
            nn.Linear(32, d_model),
        )

        self.out_proj = nn.Linear(d_model, in_channels)
        self.norm = nn.LayerNorm(in_channels)

    def forward(self, x, dates):
        B, T, C, H, W = x.shape

        x_flat = x.permute(0, 3, 4, 1, 2).reshape(B * H * W, T, C)

        t_enc = self.temporal_mlp(dates.unsqueeze(-1))
        t_enc = t_enc.unsqueeze(2).unsqueeze(3)
        t_enc = t_enc.expand(B, T, H, W, -1)
        t_enc_flat = t_enc.reshape(B * H * W, T, -1)

        k = self.k_proj(x_flat) + t_enc_flat
        v = self.v_proj(x_flat) + t_enc_flat

        k = k.view(B * H * W, T, self.n_head, self.d_k).transpose(1, 2)
        v = v.view(B * H * W, T, self.n_head, self.d_k).transpose(1, 2)

        q = self.master_query.expand(B * H * W, -1, -1).unsqueeze(2)

        attn = torch.matmul(q, k.transpose(-2, -1)) / (self.d_k ** 0.5)
        attn = torch.softmax(attn, dim=-1)

        out = torch.matmul(attn, v).squeeze(2)
        out = out.reshape(B * H * W, -1)
        out = self.out_proj(out)

        x_mean = x_flat.mean(dim=1)
        out = self.norm(out + x_mean)

        return out.reshape(B, H, W, C).permute(0, 3, 1, 2)


class UTAE(nn.Module):
    def __init__(self, in_channels=10, n_classes=1, base_ch=64):
        super().__init__()

        self.enc1 = ConvBlock(in_channels, base_ch)
        self.enc2 = ConvBlock(base_ch, base_ch * 2)
        self.enc3 = ConvBlock(base_ch * 2, base_ch * 4)

        self.pool = nn.MaxPool2d(2)

        self.ltae = SpatialLTAE(in_channels=base_ch * 4, n_head=8, d_k=32)

        self.ltae2 = SpatialLTAE(in_channels=base_ch * 2, n_head=4, d_k=32)

        self.up3 = nn.ConvTranspose2d(base_ch * 4, base_ch * 2, kernel_size=2, stride=2)
        self.dec3 = ConvBlock(base_ch * 4, base_ch * 2)

        self.up2 = nn.ConvTranspose2d(base_ch * 2, base_ch, kernel_size=2, stride=2)
        self.dec2 = ConvBlock(base_ch * 2, base_ch)

        self.final = nn.Conv2d(base_ch, n_classes, 1)

    def forward(self, x, batch_dates):
        B, T, C, H, W = x.shape
        x_bt = x.view(B * T, C, H, W)

        s1 = self.enc1(x_bt)
        s2 = self.enc2(self.pool(s1))
        s3 = self.enc3(self.pool(s2))

        _, _, H2, W2 = s2.shape
        _, _, H3, W3 = s3.shape

        s2_t = s2.view(B, T, -1, H2, W2)
        s3_t = s3.view(B, T, -1, H3, W3)

        agg3 = self.ltae(s3_t, batch_dates)
        agg2 = self.ltae2(s2_t, batch_dates)

        agg1 = s1.view(B, T, -1, H, W).mean(dim=1)

        d3 = self.up3(agg3)
        d3 = self.dec3(torch.cat([d3, agg2], dim=1))

        d2 = self.up2(d3)
        d2 = self.dec2(torch.cat([d2, agg1], dim=1))

        return self.final(d2)


class AgriculturalSegmentationModel(nn.Module):
    def __init__(self, n_channels=10, n_classes=1):
        super().__init__()
        self.model = UTAE(
            in_channels=n_channels,
            n_classes=n_classes
        )

    def forward(self, x, batch_dates):
        return self.model(x, batch_dates)