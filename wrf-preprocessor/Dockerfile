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
    libjasper-dev \
    libpng-dev \
    zlib1g-dev \
    tcsh \
    csh \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir requests

ENV NETCDF=/usr
ENV JASPERLIB=/usr/lib/x86_64-linux-gnu
ENV JASPERINC=/usr/include

WORKDIR /app

COPY ./WPS     /app/WPS
COPY ./config  /app/config
COPY ./scripts /app/scripts

RUN chmod +x /app/scripts/*.sh

WORKDIR /app/WPS
RUN echo 1 | ./configure && ./compile 2>&1 | tee /app/compile_wps.log

RUN if [ ! -f /app/WPS/geogrid.exe ] || \
       [ ! -f /app/WPS/ungrib.exe  ] || \
       [ ! -f /app/WPS/metgrid.exe ]; then \
        echo "WPS compilation failed. Check /app/compile_wps.log"; exit 1; \
    fi

RUN cp /app/config/namelist.wps /app/WPS/namelist.wps

WORKDIR /app

ENTRYPOINT ["/bin/bash", "/app/scripts/run_pipeline.sh"]