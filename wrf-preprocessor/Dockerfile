FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gfortran \
    m4 \
    curl \
    python3 \
    python3-pip \
    libnetcdf-dev \
    libnetcdff-dev \
    netcdf-bin \
    libhdf5-dev \
    libpng-dev \
    zlib1g-dev \
    libjpeg-dev \
    tcsh \
    csh \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Build jasper from source (removed from Ubuntu 22.04 repos)
RUN curl -fsSL https://github.com/jasper-software/jasper/releases/download/version-4.2.4/jasper-4.2.4.tar.gz \
    | tar -xz -C /tmp \
    && cmake -S /tmp/jasper-4.2.4 -B /tmp/jasper-build \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DJAS_ENABLE_SHARED=ON \
        -DJAS_ENABLE_PROGRAMS=OFF \
    && cmake --build /tmp/jasper-build --parallel $(nproc) \
    && cmake --install /tmp/jasper-build \
    && rm -rf /tmp/jasper-4.2.4 /tmp/jasper-build \
    && ldconfig

RUN pip3 install --no-cache-dir requests

ENV NETCDF=/usr
ENV JASPERLIB=/usr/local/lib
ENV JASPERINC=/usr/local/include/jasper
ENV WRF_DIR=/app/WRF
ENV WRFIO_NCD_LARGE_FILE_SUPPORT=1
ENV NETCDF_classic=1

WORKDIR /app

COPY ./WRF     /app/WRF
COPY ./WPS     /app/WPS
COPY ./config  /app/config
COPY ./scripts /app/scripts

RUN chmod +x /app/scripts/*.sh

# Compile WRF — option 32: GNU serial, nesting 1: basic
# J=1 disables parallel make to prevent .mod file ordering issues
WORKDIR /app/WRF

RUN printf "32\n1\n" | ./configure 2>&1 | tee /app/configure_wrf.log \
    && if [ ! -f configure.wrf ]; then \
           echo "WRF configure failed:"; cat /app/configure_wrf.log; exit 1; \
       fi \
    && sed -i 's/^DM_FC\s*=.*/DM_FC = gfortran/' configure.wrf \
    && sed -i 's/^DM_CC\s*=.*/DM_CC = gcc/' configure.wrf

RUN ./compile -j 1 em_real 2>&1 | tee /app/compile_wrf.log

RUN if [ ! -f /app/WRF/main/real.exe ] || [ ! -f /app/WRF/main/wrf.exe ]; then \
        echo "WRF compile failed:"; \
        grep -E 'Fatal Error|error:|ld returned' /app/compile_wrf.log | tail -20; \
        exit 1; \
    fi

# Compile WPS — option 1: GNU serial
WORKDIR /app/WPS

RUN printf "1\n" | ./configure 2>&1 | tee /app/configure_wps.log

RUN ./compile 2>&1 | tee /app/compile_wps.log

RUN if [ ! -f /app/WPS/geogrid.exe ] || \
       [ ! -f /app/WPS/ungrib.exe  ] || \
       [ ! -f /app/WPS/metgrid.exe ]; then \
        echo "WPS compile failed:"; tail -60 /app/compile_wps.log; exit 1; \
    fi

RUN cp /app/config/namelist.wps /app/WPS/namelist.wps

WORKDIR /app

ENTRYPOINT ["/bin/bash", "/app/scripts/run_pipeline.sh"]