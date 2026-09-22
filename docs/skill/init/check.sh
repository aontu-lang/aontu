#!/usr/bin/env sh
# check.sh --- the four questions to ask of a model. Run it after
# every edit to model.aontu or data.aontu.
#
# `aontu help tasks` maps a job to a verb; `aontu explain <code>` says
# what a refusal means; `aontu help language` is the whole grammar on
# one page. None of them needs a network.
set -eu

AONTU="${AONTU:-aontu}"
cd "$(dirname "$0")"

# 1. Does the data satisfy the truth -- and did the check examine
#    anything? --strict-coverage exits 1 on a check that constrained no
#    value, which is the failure a passing gate hides.
$AONTU vet --strict-coverage model.aontu data.aontu

# 2. What does it say at a path?
$AONTU model get '$.entity.planet.table' data.aontu

# 3. Why does it say that? Every contribution, with the line it is on.
$AONTU model why '$.entity.planet.table' data.aontu

# 4. A pin for the truth: it survives reformatting and moves on any
#    change of meaning.
$AONTU hash model.aontu

echo "ok --- model.aontu and data.aontu agree"
