FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    gfortran \
    m4 \
    libnetcdf-dev \
    libnetcdff-dev \
    netcdf-bin \
    tcsh \
    csh \
    && rm -rf /var/lib/apt/lists/*

ENV NETCDF=/usr

WORKDIR /app

COPY ./WRF /app/WRF
COPY ./namelist.input /app/namelist.input
COPY ./run_wrf.sh /app/scripts/run_wrf.sh

RUN chmod +x /app/scripts/run_wrf.sh

WORKDIR /app/WRF

# Option 34: gfortran/gcc with basic nesting (serial, no MPI — suitable for <= 4 GB RAM)
RUN echo 34 | ./configure && ./compile em_real 2>&1 | tee /app/compile_wrf.log

RUN if [ ! -f /app/WRF/test/em_real/wrf.exe ]; then \
        echo "WRF compilation failed. Check /app/compile_wrf.log"; exit 1; \
    fi

WORKDIR /app/WRF/test/em_real

RUN cp /app/namelist.input .

ENTRYPOINT ["/bin/bash", "/app/scripts/run_wrf.sh"]
