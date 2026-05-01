#!/usr/bin/env node

process.title = 'cloudy'

import { createProgram } from '../src/cli/index.js';

const program = createProgram();
program.parse();
