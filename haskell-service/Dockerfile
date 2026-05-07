FROM haskell:9.6-slim AS builder

WORKDIR /opt/haskell-service
RUN cabal update

COPY *.cabal .

RUN cabal build --only-dependencies -j

COPY . .
RUN cabal install --install-method=copy --installdir=/opt/build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libgmp10 libffi8 libnuma1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /opt/build/haskell-service-exe /app/haskell-service-exe

CMD ["./haskell-service-exe"]
