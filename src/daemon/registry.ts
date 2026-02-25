import path from 'node:path';
import type { ProjectMeta } from '../core/types.js';
import { readJson, writeJson, ensureDir } from '../utils/fs.js';
import { getGlobalConfigDir } from '../config/global-config.js';
import { PROJECTS_FILE } from '../config/defaults.js';

function getRegistryPath(): string {
  return path.join(getGlobalConfigDir(), PROJECTS_FILE);
}

async function readRegistry(): Promise<ProjectMeta[]> {
  const data = await readJson<ProjectMeta[]>(getRegistryPath());
  return data ?? [];
}

async function writeRegistry(projects: ProjectMeta[]): Promise<void> {
  await ensureDir(getGlobalConfigDir());
  await writeJson(getRegistryPath(), projects);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return readRegistry();
}

export async function findProject(id: string): Promise<ProjectMeta | undefined> {
  const projects = await readRegistry();
  return projects.find((p) => p.id === id);
}

export async function addProject(entry: ProjectMeta): Promise<void> {
  const projects = await readRegistry();
  const existing = projects.findIndex((p) => p.id === entry.id);
  if (existing >= 0) {
    projects[existing] = { ...entry, registeredAt: projects[existing].registeredAt };
  } else {
    projects.push(entry);
  }
  await writeRegistry(projects);
}

export async function updateProject(id: string, patch: Partial<ProjectMeta>): Promise<void> {
  const projects = await readRegistry();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error(`Project "${id}" not found in registry`);
  projects[idx] = { ...projects[idx], ...patch };
  await writeRegistry(projects);
}

export async function removeProject(id: string): Promise<void> {
  const projects = await readRegistry();
  await writeRegistry(projects.filter((p) => p.id !== id));
}
