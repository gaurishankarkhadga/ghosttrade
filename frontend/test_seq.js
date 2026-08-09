const stringArray = ["A", "B", "C"];
let next = ["", "", ""];

for (let tick=0; tick<10; tick++) {
  let hasChanges = false;
  for (let i = 0; i < stringArray.length; i++) {
    const target = stringArray[i] || '';
    let current = next[i] || '';
    if (!target.startsWith(current)) current = '';
    if (current.length < target.length) {
      next[i] = target.slice(0, current.length + 1);
      hasChanges = true;
      break;
    }
  }
  console.log(`Tick ${tick}:`, next);
}
