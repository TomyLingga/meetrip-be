import { db } from '../connection'
import { refGrade } from '../schema'

async function main() {
  const grades = await db.select().from(refGrade);
  console.log('GRADES IN DB:', grades);
  process.exit(0);
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
