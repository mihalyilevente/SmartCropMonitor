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


class ConvLSTMCell(nn.Module):
    def __init__(self, in_channels, hidden_channels, kernel_size):
        super(ConvLSTMCell, self).__init__()
        self.hidden_channels = hidden_channels
        padding = kernel_size // 2

        self.conv = nn.Conv2d(in_channels + hidden_channels, 4 * hidden_channels,
                              kernel_size=kernel_size, padding=padding)

    def forward(self, x, hidden):
        h_cur, c_cur = hidden
        combined = torch.cat([x, h_cur], dim=1)
        combined_conv = self.conv(combined)

        cc_i, cc_f, cc_o, cc_g = torch.split(combined_conv, self.hidden_channels, dim=1)
        i = torch.sigmoid(cc_i)
        f = torch.sigmoid(cc_f)
        o = torch.sigmoid(cc_o)
        g = torch.tanh(cc_g)

        c_next = f * c_cur + i * g
        h_next = o * torch.tanh(c_next)
        return h_next, c_next


class U_ConvLSTM(nn.Module):
    def __init__(self, in_channels=10, n_classes=1):
        super().__init__()
        self.enc1 = ConvBlock(in_channels, 64)
        self.enc2 = ConvBlock(64, 128)
        self.pool = nn.MaxPool2d(2)

        self.conv_lstm = ConvLSTMCell(in_channels=128, hidden_channels=128, kernel_size=3)

        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.dec1 = ConvBlock(128 + 64, 64)
        self.final = nn.Conv2d(64, n_classes, kernel_size=1)

    def forward(self, x, batch_dates=None):
        B, T, C, H, W = x.shape

        x_reshaped = x.view(B * T, C, H, W)
        s1 = self.enc1(x_reshaped)
        s2 = self.enc2(self.pool(s1))

        feat_seq = s2.view(B, T, 128, 64, 64)

        h = torch.zeros(B, 128, 64, 64).to(x.device)
        c = torch.zeros(B, 128, 64, 64).to(x.device)

        for t in range(T):
            h, c = self.conv_lstm(feat_seq[:, t, :, :, :], (h, c))

        s1_mean = s1.view(B, T, 64, H, W).mean(dim=1)

        d1 = self.up(h)
        d1 = torch.cat([d1, s1_mean], dim=1)

        out = self.dec1(d1)
        return self.final(out)


class AgriculturalSegmentationModel(nn.Module):
    def __init__(self, n_channels=10, n_classes=1):
        super().__init__()
        self.model = U_ConvLSTM(
            in_channels=n_channels,
            n_classes=n_classes
        )

    def forward(self, x, batch_dates):
        return self.model(x)