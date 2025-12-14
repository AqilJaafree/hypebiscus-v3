// Helper to format balance with dynamic superscript for leading zeros after decimal
export function formatBalanceWithSub(balance: number, decimals = 6) {
  if (balance === 0) return '0';
  const str = balance.toFixed(decimals);
  // Match: int part, all zeros after decimal, rest
  const match = str.match(/^([0-9]+)\.(0+)(\d*)$/);
  if (!match) return str;
  const [, intPart, zeros, rest] = match;
  // Show the first zero after the decimal, then subscript the total count of zeros
  return (
    <>
      {intPart}.0{sub(zeros.length)}
      {rest}
    </>
  );
  function sub(n: number | null) {
    return n && n > 1 ? (
      <sub style={{ fontSize: '0.7em', verticalAlign: 'baseline' }}>{n}</sub>
    ) : null;
  }
}
