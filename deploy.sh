#!/bin/bash
git pull && yarn && npm run build && pm2 reload bi-balance
