import type { Todo } from './domain';
type Reminder={completed:boolean;update:(patch:{completed:boolean})=>Promise<void>};
type Adapter={read:(id:string)=>Promise<Reminder>;saveTodo:(id:string,done:boolean)=>Promise<boolean>;active:()=>boolean};
export async function reconcileApple(todos:Todo[],direction:'device'|'duck',adapter:Adapter,cursor=''){
 const all=todos.filter(todo=>todo.source?.provider==='apple-reminders'&&todo.id>cursor).sort((a,b)=>a.id.localeCompare(b.id));const page=all.slice(0,5);let changed=0,failed=0;
 for(const todo of page){if(!adapter.active())break;try{const reminder=await adapter.read(todo.source!.externalId);if(!adapter.active())break;if(direction==='device'){if(reminder.completed!==todo.done){await reminder.update({completed:todo.done});changed++;}}else if(reminder.completed!==todo.done){if(await adapter.saveTodo(todo.id,reminder.completed))changed++;else failed++;}}catch{failed++;}}
 return {changed,failed,nextCursor:all.length>page.length?page.at(-1)!.id:null};
}
