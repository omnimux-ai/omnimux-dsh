/** Conservative container sniffing shared by import and native audio actions. */
export function isAudioHeader(extension: string, head: Buffer): boolean {
  const ascii = (offset: number, text: string): boolean => head.subarray(offset, offset + text.length).toString('ascii') === text;
  switch (extension.toLowerCase()) {
    case '.wav': return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    case '.flac': return ascii(0, 'fLaC');
    case '.mp3': return ascii(0, 'ID3') || (head[0] === 0xff && ((head[1] ?? 0) & 0xe6) === 0xe2);
    case '.aac': return head[0] === 0xff && ((head[1] ?? 0) & 0xf6) === 0xf0;
    case '.m4a': return ascii(4, 'ftyp') && ['M4A ', 'M4B '].some((brand) => ascii(8, brand));
    case '.ogg':
    case '.opus': return ascii(0, 'OggS') && (head.includes(Buffer.from('OpusHead')) || head.includes(Buffer.from('\x01vorbis')));
    default: return false;
  }
}

export function identifyAudio(head: Buffer): { extension: string; mimeType: string } | null {
  const formats: Array<[string, string]> = [
    ['.wav', 'audio/wav'], ['.flac', 'audio/flac'], ['.mp3', 'audio/mpeg'],
    ['.aac', 'audio/aac'], ['.m4a', 'audio/mp4'], ['.ogg', 'audio/ogg'],
  ];
  const match = formats.find(([extension]) => isAudioHeader(extension, head));
  return match ? { extension: match[0], mimeType: match[1] } : null;
}
