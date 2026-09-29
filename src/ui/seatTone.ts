const SEAT_TONES = ['bg-sunflower', 'bg-sky', 'bg-bubblegum', 'bg-mint', 'bg-tangerine', 'bg-lilac', 'bg-sky', 'bg-bubblegum']

export function seatTone(seat: number): string {
  return SEAT_TONES[seat % SEAT_TONES.length]
}
