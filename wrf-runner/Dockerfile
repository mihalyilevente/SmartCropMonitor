FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gfortran \
    m4 \
    curl \
    libnetcdf-dev \
    libnetcdff-dev \
    netcdf-bin \
    libhdf5-dev \
    tcsh \
    csh \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/netcdf/lib && \
    mkdir -p /usr/local/netcdf/include && \
    ln -s /usr/include/netcdf.mod /usr/local/netcdf/include/netcdf.mod && \
    ln -s /usr/include/netcdf.h /usr/local/netcdf/include/netcdf.h && \
    ln -s /usr/lib/x86_64-linux-gnu/libnetcdf.so /usr/local/netcdf/lib/libnetcdf.so && \
    ln -s /usr/lib/x86_64-linux-gnu/libnetcdff.so /usr/local/netcdf/lib/libnetcdff.so

ENV NETCDF=/usr/local/netcdf
ENV NETCDF_classic=1
ENV WRFIO_NCD_LARGE_FILE_SUPPORT=1

WORKDIR /app

COPY ./WRF             /app/WRF
COPY ./namelist.input  /app/namelist.input
COPY ./run_wrf.sh      /app/scripts/run_wrf.sh
COPY ./slack_notify.sh /app/scripts/slack_notify.sh

RUN chmod +x /app/scripts/run_wrf.sh /app/scripts/slack_notify.sh

WORKDIR /app/WRF

RUN printf "32\n1\n" | ./configure 2>&1 | tee /app/configure_wrf.log \
    && if [ ! -f configure.wrf ]; then \
           echo "WRF configure failed:"; cat /app/configure_wrf.log; exit 1; \
       fi

RUN ./compile -j 1 em_real 2>&1 | tee /app/compile_wrf.log

RUN if [ ! -f /app/WRF/main/real.exe ] || [ ! -f /app/WRF/main/wrf.exe ]; then \
        echo "WRF compile failed:"; \
        grep -E 'Fatal Error|error:|ld returned' /app/compile_wrf.log | tail -20; \
        exit 1; \
    fi

WORKDIR /app/WRF/test/em_real

RUN ln -sf /app/WRF/main/real.exe . \
 && ln -sf /app/WRF/main/wrf.exe  . \
 && cp /app/namelist.input .

ENTRYPOINT ["/bin/bash", "/app/scripts/run_wrf.sh"]