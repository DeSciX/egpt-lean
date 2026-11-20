# Makefile — reproduce the #extract_to_c end-to-end demo.
#
# Pass B: per-theorem subdirectories under prototype/<Theorem_Name>/.
# `make all` iterates every subdirectory, compiles extracted.c against
# libegpt_num, runs the binary, and byte-compares stdout to expected.
#
# Prereqs:
#   - FRAQTL with feat/egpt-num-cffi merged. Set EGPT_NUM to the
#     directory of the engine's integer number crate:
#     `make EGPT_NUM=/abs/path/to/egpt_num`.
#   - `cargo build --release -p egpt_num` (or `make runtime`).
#   - `lake build InformationTheory.EntropyNumber.ContinuumHypothesis`
#     (or `make extract` — regenerates all extracted.c files).

EGPT_NUM    ?= $(error set EGPT_NUM to the directory of the engine's integer number crate)
RUST_TARGET  = $(abspath $(EGPT_NUM)/../../target/release)
INCLUDE_DIR  = $(EGPT_NUM)/include
LEAN_ROOT   := $(abspath ../..)

CC      ?= cc
CFLAGS  ?= -Wall -Wextra -O2

# Discover per-theorem subdirectories.
TARGETS := $(wildcard */extracted.c)
BINS    := $(TARGETS:%/extracted.c=%/extracted_bin)

.PHONY: all extract runtime diff clean

all: diff

extract:
	@echo ">>> #extract_to_c (via lake env lean)"
	@cd $(LEAN_ROOT) && lake env lean extraction/ExtractionCommand.lean

runtime:
	@echo ">>> cargo build --release -p egpt_num"
	@cd $(EGPT_NUM) && cargo build --release -p egpt_num

%/extracted_bin: %/extracted.c
	@echo ">>> cc $<"
	$(CC) $(CFLAGS) -o $@ $< \
	    -I $(INCLUDE_DIR) \
	    -L $(RUST_TARGET) \
	    -legpt_num \
	    -Wl,-rpath,$(RUST_TARGET)

diff: $(BINS)
	@set -e; for dir in $(TARGETS:%/extracted.c=%); do \
	    echo ">>> $$dir"; \
	    ./$$dir/extracted_bin > /tmp/$$dir.out 2>&1; \
	    diff $$dir/expected_output.txt /tmp/$$dir.out && \
	        echo "  ✓ $$dir byte-equivalent"; \
	done

clean:
	@rm -f */extracted_bin /tmp/Extraction_*.out
