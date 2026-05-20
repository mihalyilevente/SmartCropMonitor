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
    libopenmpi-dev \
    openmpi-bin \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/jasper-software/jasper/releases/download/version-2.0.33/jasper-2.0.33.tar.gz \
    | tar -xz -C /tmp \
    && cmake -S /tmp/jasper-2.0.33 -B /tmp/jasper-build \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DJAS_ENABLE_SHARED=ON \
        -DJAS_ENABLE_PROGRAMS=OFF \
        -DJAS_ENABLE_OPENGL=OFF \
    && cmake --build /tmp/jasper-build --parallel $(nproc) \
    && cmake --install /tmp/jasper-build \
    && rm -rf /tmp/jasper-2.0.33 /tmp/jasper-build \
    && ldconfig

RUN pip3 install --no-cache-dir requests

RUN mkdir -p /usr/local/netcdf/lib && \
    mkdir -p /usr/local/netcdf/include && \
    ln -sf /usr/include/netcdf.mod      /usr/local/netcdf/include/netcdf.mod  && \
    ln -sf /usr/include/netcdf.h        /usr/local/netcdf/include/netcdf.h    && \
    ln -sf /usr/include/netcdf.inc      /usr/local/netcdf/include/netcdf.inc  && \
    ln -sf /usr/lib/x86_64-linux-gnu/libnetcdf.so  /usr/local/netcdf/lib/libnetcdf.so  && \
    ln -sf /usr/lib/x86_64-linux-gnu/libnetcdff.so /usr/local/netcdf/lib/libnetcdff.so

ENV NETCDF=/usr/local/netcdf
ENV JASPERLIB=/usr/local/lib
ENV JASPERINC=/usr/local/include
ENV WRF_DIR=/app/WRF
ENV WRFIO_NCD_LARGE_FILE_SUPPORT=1
ENV NETCDF_classic=1
ENV COMPRESSION_LIBS="-ljasper -lpng -lz"
ENV COMPRESSION_INC="-I/usr/local/include"
ENV OMPI_ALLOW_RUN_AS_ROOT=1
ENV OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1

WORKDIR /app

COPY ./WRF     /app/WRF
COPY ./WPS     /app/WPS
COPY ./config  /app/config
COPY ./scripts /app/scripts

RUN chmod +x /app/scripts/*.sh

WORKDIR /app/WRF

RUN printf "32\n1\n" | ./configure 2>&1 | tee /app/configure_wrf.log \
    && if [ ! -f configure.wrf ]; then \
           echo "=== WRF configure failed ==="; cat /app/configure_wrf.log; exit 1; \
       fi

RUN J=$(nproc) ./compile em_real 2>&1 | tee /app/compile_wrf.log

RUN if [ ! -f /app/WRF/main/real.exe ] || [ ! -f /app/WRF/main/wrf.exe ]; then \
        echo "=== WRF compile failed ==="; \
        grep -E 'Fatal Error|error:|ld returned' /app/compile_wrf.log | tail -30; \
        exit 1; \
    fi

WORKDIR /app/WPS

RUN printf "3\n" | ./configure 2>&1 | tee /app/configure_wps.log \
    && if [ ! -f configure.wps ]; then \
           echo "=== WPS configure failed ==="; cat /app/configure_wps.log; exit 1; \
       fi

RUN sed -i \
    -e 's/-lnetcdf\b/-lnetcdff -lnetcdf/g' \
    -e 's|COMPRESSION_LIBS\s*=.*|COMPRESSION_LIBS = -L/usr/local/lib -ljasper -lpng -lz|' \
    configure.wps

RUN ./compile 2>&1 | tee /app/compile_wps.log

RUN if [ ! -f /app/WPS/geogrid.exe ] || \
       [ ! -f /app/WPS/ungrib.exe  ] || \
       [ ! -f /app/WPS/metgrid.exe ]; then \
        echo "=== WPS compile failed ==="; \
        grep -n "undefined reference\|Error\|error" /app/compile_wps.log | grep -v Warning | head -30; \
        exit 1; \
    fi

RUN cp /app/config/namelist.wps /app/WPS/namelist.wps

WORKDIR /app
ENTRYPOINT ["/bin/bash", "/app/scripts/run_pipeline.sh"]