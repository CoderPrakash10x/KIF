function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Standard overlap formula from Section 10:
// Existing.Start < New.End AND Existing.End > New.Start
function rangesOverlap(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB);
}

module.exports = { timeToMinutes, rangesOverlap };