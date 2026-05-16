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


class ConvLTCCell(nn.Module):
    def __init__(self, in_channels, hidden_channels, kernel_size=3):
        super(ConvLTCCell, self).__init__()
        self.hidden_channels = hidden_channels
        padding = kernel_size // 2

        self.conv = nn.Conv2d(in_channels + hidden_channels, 2 * hidden_channels,
                              kernel_size=kernel_size, padding=padding)

        self.tau = nn.Parameter(torch.ones(1, hidden_channels, 1, 1))

    def forward(self, x, h, dt):
        combined = torch.cat([x, h], dim=1)
        conv_out = self.conv(combined)

        f_x_h, w_x_h = torch.split(conv_out, self.hidden_channels, dim=1)

        f_x_h = torch.tanh(f_x_h)
        w_x_h = torch.sigmoid(w_x_h)

        ratio = dt / (self.tau + 1e-6)
        h_next = (h + ratio * w_x_h * f_x_h) / (1.0 + ratio * w_x_h)

        return h_next


class ResBlock(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)

        self.shortcut = nn.Sequential()
        if in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x):
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        return F.relu(out)


class AttentionGate(nn.Module):
    def __init__(self, F_g, F_l, F_int):
        super().__init__()
        self.W_g = nn.Conv2d(F_g, F_int, 1)
        self.W_x = nn.Conv2d(F_l, F_int, 1)
        self.psi = nn.Conv2d(F_int, 1, 1)

    def forward(self, g, x):
        attn = torch.sigmoid(self.psi(F.relu(self.W_g(g) + self.W_x(x))))
        return x * attn


class U_ConvLTC(nn.Module):
    def __init__(self, in_channels=10, n_classes=1):
        super().__init__()
        self.enc1 = ResBlock(in_channels, 64)
        self.enc2 = ResBlock(64, 128)
        self.enc3 = ResBlock(128, 256)

        self.pool = nn.MaxPool2d(2)

        self.ltc_cell = ConvLTCCell(in_channels=256, hidden_channels=256)

        self.attn1 = AttentionGate(F_g=256, F_l=128, F_int=64)
        self.attn2 = AttentionGate(F_g=128, F_l=64, F_int=32)

        self.up1 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.dec1 = ResBlock(256 + 128, 128)

        self.up2 = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.dec2 = ResBlock(128 + 64, 64)

        self.final = nn.Conv2d(64, n_classes, kernel_size=1)

    def forward(self, x, batch_dates):
        B, T, C, H, W = x.shape

        x_reshaped = x.view(B * T, C, H, W)
        s1 = self.enc1(x_reshaped)
        s2 = self.enc2(self.pool(s1))
        s3 = self.enc3(self.pool(s2))

        feat_seq = s3.view(B, T, 256, H // 4, W // 4)
        h = torch.zeros(B, 256, H // 4, W // 4).to(x.device)

        for t in range(T):
            if t == 0:
                dt = torch.ones(B, 1, 1, 1).to(x.device) * 0.1
            else:
                dt = (batch_dates[:, t] - batch_dates[:, t - 1]).view(B, 1, 1, 1)
                dt = torch.clamp(dt, min=1e-3)
            h = self.ltc_cell(feat_seq[:, t], h, dt)

        s1_mean = s1.view(B, T, 64, H, W).mean(dim=1)
        s2_mean = s2.view(B, T, 128, H // 2, W // 2).mean(dim=1)

        d1 = self.up1(h)
        s2_attn = self.attn1(g=d1, x=s2_mean)
        d1 = torch.cat([d1, s2_attn], dim=1)
        d1 = self.dec1(d1)

        d2 = self.up2(d1)
        s1_attn = self.attn2(g=d2, x=s1_mean)
        d2 = torch.cat([d2, s1_attn], dim=1)
        d2 = self.dec2(d2)

        return self.final(d2)


class AgriculturalSegmentationModel(nn.Module):
    def __init__(self, n_channels=10, n_classes=1):
        super().__init__()
        self.model = U_ConvLTC(in_channels=n_channels, n_classes=n_classes)

    def forward(self, x, batch_dates):
        return self.model(x, batch_dates)