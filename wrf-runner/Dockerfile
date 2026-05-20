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
    tcsh \
    csh \
    && rm -rf /var/lib/apt/lists/*

ENV NETCDF=/usr
ENV NETCDF_classic=1
ENV WRFIO_NCD_LARGE_FILE_SUPPORT=1

WORKDIR /app

COPY ./WRF             /app/WRF
COPY ./namelist.input  /app/namelist.input
COPY ./run_wrf.sh      /app/scripts/run_wrf.sh
COPY ./slack_notify.sh /app/scripts/slack_notify.sh

RUN chmod +x /app/scripts/run_wrf.sh /app/scripts/slack_notify.sh

# Option 32: GNU gfortran/gcc serial (no MPI)
# Nesting 1: basic
WORKDIR /app/WRF

RUN printf "32\n1\n" | ./configure 2>&1 | tee /app/configure_wrf.log \
    && if [ ! -f configure.wrf ]; then \
           echo "WRF configure failed:"; cat /app/configure_wrf.log; exit 1; \
       fi

RUN ./compile em_real 2>&1 | tee /app/compile_wrf.log

RUN if [ ! -f /app/WRF/main/real.exe ] || [ ! -f /app/WRF/main/wrf.exe ]; then \
        echo "WRF compile failed:"; tail -60 /app/compile_wrf.log; exit 1; \
    fi

# Link executables to run directory
WORKDIR /app/WRF/test/em_real

RUN ln -sf /app/WRF/main/real.exe . \
 && ln -sf /app/WRF/main/wrf.exe  . \
 && cp /app/namelist.input .

ENTRYPOINT ["/bin/bash", "/app/scripts/run_wrf.sh"]