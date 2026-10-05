// Centered windows are truncated and renormalized at the boundaries.
export function smooth(values, method, width = 21, alpha = .18) {
  const radius = Math.floor(width / 2);
  if (method === 'ema') {
    let previous = values[0];
    return values.map(value => (previous = alpha * value + (1 - alpha) * previous));
  }
  return values.map((_, i) => {
    const start = Math.max(0, i - radius), end = Math.min(values.length - 1, i + radius);
    if (method === 'median') {
      const sorted = values.slice(start, end + 1).sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
    if (method === 'polynomial') {
      // Least-squares quadratic at each point, including asymmetric edge windows.
      const matrix = Array.from({length:3}, () => [0,0,0,0]);
      for (let j = start; j <= end; j++) {
        const x = (j - i) / Math.max(1, radius), powers = [1,x,x*x,x*x*x,x*x*x*x];
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) matrix[row][col] += powers[row+col];
          matrix[row][3] += values[j] * powers[row];
        }
      }
      for (let col = 0; col < 3; col++) {
        let pivot = col;
        for (let row = col+1; row < 3; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
        [matrix[col],matrix[pivot]] = [matrix[pivot],matrix[col]];
        const divisor = matrix[col][col];
        if (Math.abs(divisor) < 1e-12) return values[i];
        for (let k = col; k < 4; k++) matrix[col][k] /= divisor;
        for (let row = 0; row < 3; row++) if (row !== col) {
          const factor = matrix[row][col];
          for (let k = col; k < 4; k++) matrix[row][k] -= factor * matrix[col][k];
        }
      }
      return matrix[0][3];
    }
    let sum = 0, weight = 0;
    for (let j = start; j <= end; j++) {
      const w = method === 'gaussian' ? Math.exp(-.5 * ((j-i) / Math.max(1,width/6)) ** 2) : 1;
      sum += w * values[j]; weight += w;
    }
    return sum / weight;
  });
}
export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted; }
    else if(c===',' && !quoted){row.push(field.trim());field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted) throw new Error('Unclosed quoted field in CSV.');
  row.push(field.trim());if(row.some(Boolean))rows.push(row);
  if(!rows.length)throw new Error('The CSV is empty.');
  const numeric = s => s !== undefined && s !== '' && Number.isFinite(Number(s));
  const header = rows[0].some(s => !numeric(s));
  const names = header ? rows.shift() : rows[0].map((_,i)=>`Column ${i+1}`);
  const columns = names.map((name,i)=>({name,values:rows.map(r=>r[i])})).filter(c=>c.values.filter(numeric).length>=3);
  if(!columns.length)throw new Error('A column must contain at least three numeric samples.');
  const dateIndex = names.findIndex(name => /^date$/i.test(name.replace(/^\uFEFF/, '')));
  return columns.map(c=>({name:c.name,values:c.values.filter(numeric).slice(0,10000).map(Number),skipped:c.values.filter(v=>!numeric(v)).length,total:c.values.filter(numeric).length,
    ...(dateIndex >= 0 ? {dates: rows.filter((_,i)=>numeric(c.values[i])).slice(0,10000).map(r=>r[dateIndex])} : {})}));
}
