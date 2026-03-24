const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidUUID(id: string): void {
    if (!UUID_RE.test(id)) throw new Error(`Invalid map ID format: "${id}"`);
}

export function sanitizeFileName(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9\-_.]/g, '');
    if (sanitized.length === 0) throw new Error(`Unsafe filename after sanitization: "${name}"`);
    return sanitized;
}

export function parseContainerIds(dockerOutput: string): string[] {
    return dockerOutput
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && /^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/.test(l));
}
