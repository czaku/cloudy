#!/usr/bin/env node

import { createProgram } from '../src/cli/index.js';

const program = createProgram();
program.parse();
