const today = new Date();
const pastDate = new Date(today);
pastDate.setDate(today.getDate() - (180));

const yyyy = pastDate.getFullYear();
const mm = String(pastDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based
const dd = String(pastDate.getDate()).padStart(2, '0');

const formattedDate = `${yyyy}-${mm}-${dd}`;
console.log(formattedDate); // e.g., '2024-11-19'
