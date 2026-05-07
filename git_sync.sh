#!/bin/bash

REPO_DIR="/root/SmartCropMonitor"

cd $REPO_DIR


git add .


if ! git diff-index --quiet HEAD; then

    git commit -m "chore(data): $(date '+%Y-%m-%d %H:%M:%S')"

    git push origin master

    echo "Changes pushed successfully at $(date)"

else

    echo "No changes detected, skipping push."

fi
