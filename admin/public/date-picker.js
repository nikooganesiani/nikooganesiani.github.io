import { t, ui, registerStatic } from './studio-i18n.js';
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const pad = value => String(value).padStart(2,'0');
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dayKey = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
export function tbilisiDate(value = Date.now()) { return new Date((typeof value==='number'?value:Date.parse(value))+4*3600000); }
export function formatStudioDate(value) {
  if(!value)return '';
  const date=tbilisiDate(value);
  if(!Number.isFinite(date.getTime()))return '';
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth()+1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
export function studioDateInstant(day,hour,minute) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}$/.test(String(hour)) || !/^\d{1,2}$/.test(String(minute)) || Number(hour)>23 || Number(minute)>59) return null;
  const date=new Date(day+'T00:00:00Z');
  if(!Number.isFinite(date.getTime()) || dayKey(date)!==day)return null;
  return `${day}T${pad(Number(hour))}:${pad(Number(minute))}:00+04:00`;
}
export function dateControl(label,key,value) {
  const display=formatStudioDate(value) || t('Выбрать дату и время');
  return `<div class="field"><span class="field-label">${escape(label)}</span><button type="button" class="studio-date-trigger" data-studio-date="${escape(key)}" data-date-value="${escape(value)}" data-date-label="${escape(label)}" aria-haspopup="dialog" aria-label="${escape(label)}: ${escape(display)}"><span${value?'':' class="date-placeholder"'}>${escape(display)}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></svg></button></div>`;
}

export function createDatePicker() {
  const dialog=document.createElement('dialog');
  dialog.className='studio-date-dialog';dialog.setAttribute('aria-labelledby','studio-date-heading');
  dialog.innerHTML=`<div class="studio-date-heading"><div><h2 id="studio-date-heading">Дата и время</h2><p>Тбилиси · UTC+4 · 24 часа</p></div><button type="button" class="icon-button" data-date-action="cancel" aria-label="Закрыть календарь">×</button></div><div class="studio-date-monthbar"><button type="button" class="icon-button" data-date-action="previous" aria-label="Предыдущий месяц">‹</button><label class="field"><span class="sr-only">Месяц</span><select id="studio-date-month">${MONTHS.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select></label><label class="field studio-date-year"><span class="sr-only">Год</span><input id="studio-date-year" type="number" min="2000" max="2100" aria-label="Год"></label><button type="button" class="icon-button" data-date-action="next" aria-label="Следующий месяц">›</button></div><div class="studio-date-weekdays" aria-hidden="true">${DAYS.map(day=>`<span>${day}</span>`).join('')}</div><div id="studio-date-grid" class="studio-date-grid" role="grid" aria-label="Календарь"></div><div class="studio-date-time"><span>Время</span><label class="field"><span class="sr-only">Часы от 00 до 23</span><input id="studio-date-hour" type="text" inputmode="numeric" maxlength="2" aria-label="Часы от 00 до 23"></label><strong>:</strong><label class="field"><span class="sr-only">Минуты от 00 до 59</span><input id="studio-date-minute" type="text" inputmode="numeric" maxlength="2" aria-label="Минуты от 00 до 59"></label><span class="studio-date-time-hint">00:00–23:59</span></div><p id="studio-date-error" role="alert" hidden></p><div class="studio-date-footer"><button type="button" class="text-button" data-date-action="today">Сегодня</button><button type="button" class="text-button" data-date-action="clear">Очистить</button><button type="button" class="button primary" data-date-action="apply">Применить</button></div>`;
  document.body.append(dialog);registerStatic(dialog);
  const find=selector=>dialog.querySelector(selector);
  let selected=new Date();let change;let trigger;
  function render(focus=false) {
    const year=selected.getUTCFullYear();const month=selected.getUTCMonth();
    find('#studio-date-month').value=String(month);find('#studio-date-year').value=year;
    const first=new Date(Date.UTC(year,month,1));
    const start=1-(first.getUTCDay()+6)%7;
    const today=dayKey(tbilisiDate());
    const selectedKey=dayKey(selected);
    find('#studio-date-grid').setAttribute('aria-label',t(MONTHS[month])+' '+year);
    const cells=Array.from({length:42},(_,index)=>{
      const day=new Date(Date.UTC(year,month,start+index));const key=dayKey(day);
      return `<button type="button" role="gridcell" data-date-day="${key}" class="studio-date-day${day.getUTCMonth()!==month?' other-month':''}${key===today?' today':''}${key===selectedKey?' selected':''}" aria-selected="${key===selectedKey}"${key===today?' aria-current="date"':''} aria-label="${day.getUTCDate()} ${t(MONTHS[day.getUTCMonth()])} ${day.getUTCFullYear()}" tabindex="${key===selectedKey?0:-1}">${day.getUTCDate()}</button>`;
    });
    find('#studio-date-grid').innerHTML=Array.from({length:6},(_,index)=>`<div role="row">${cells.slice(index*7,index*7+7).join('')}</div>`).join('');
    if(focus)find('[aria-selected="true"]').focus();
  }
  function shiftMonth(count) {
    const year=selected.getUTCFullYear();const month=selected.getUTCMonth()+count;const day=selected.getUTCDate();
    const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    const next=new Date(Date.UTC(year,month,Math.min(day,last)));
    if(next.getUTCFullYear()<2000 || next.getUTCFullYear()>2100)return;
    selected=next;render();
  }
  function finish(value) {
    const key=trigger.dataset.studioDate;
    dialog.close();change(value);
    [...document.querySelectorAll('[data-studio-date]')].find(button=>button.dataset.studioDate===key)?.focus({preventScroll:true});
  }
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.dateDay){selected=new Date(button.dataset.dateDay+'T00:00:00Z');render(true);return;}
    const action=button.dataset.dateAction;
    if(action==='cancel')dialog.close();
    if(action==='previous')shiftMonth(-1);
    if(action==='next')shiftMonth(1);
    if(action==='today'){selected=tbilisiDate();render(true);}
    if(action==='clear')finish('');
    if(action==='apply'){
      const hour=find('#studio-date-hour');const minute=find('#studio-date-minute');
      const value=studioDateInstant(dayKey(selected),hour.value,minute.value);
      if(!value){const error=find('#studio-date-error');error.textContent=t('Введите время в формате 24 часов: часы 00–23, минуты 00–59.');error.hidden=false;(!/^\d{1,2}$/.test(hour.value)||Number(hour.value)>23?hour:minute).focus();return;}
      finish(value);
    }
  });
  dialog.addEventListener('change',event=>{
    if(event.target.id==='studio-date-month')shiftMonth(Number(event.target.value)-selected.getUTCMonth());
    if(event.target.id==='studio-date-year'){
      const year=Number(event.target.value);if(!Number.isInteger(year)||year<2000||year>2100){event.target.reportValidity();return;}
      shiftMonth((year-selected.getUTCFullYear())*12);
    }
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Enter' && event.target.matches('#studio-date-hour,#studio-date-minute')){event.preventDefault();find('[data-date-action="apply"]').click();return;}
    if(!event.target.dataset.dateDay)return;
    const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-(selected.getUTCDay()+6)%7,End:6-(selected.getUTCDay()+6)%7};
    if(Object.hasOwn(moves,event.key)){event.preventDefault();const next=new Date(selected);next.setUTCDate(next.getUTCDate()+moves[event.key]);if(next.getUTCFullYear()>=2000&&next.getUTCFullYear()<=2100){selected=next;render(true);}}
    if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();shiftMonth((event.key==='PageUp'?-1:1)*(event.shiftKey?12:1));find('[aria-selected="true"]').focus();}
  });
  window.addEventListener('studio:language-change',()=>{if(dialog.open)render();});
  return {
    open(button,onChange) {
      trigger=button;change=onChange;
      selected=button.dataset.dateValue?tbilisiDate(button.dataset.dateValue):tbilisiDate();
      find('#studio-date-heading').textContent=button.dataset.dateLabel;
      find('#studio-date-hour').value=pad(selected.getUTCHours());find('#studio-date-minute').value=pad(selected.getUTCMinutes());
      find('#studio-date-error').hidden=true;render();dialog.showModal();find('[aria-selected="true"]').focus();
    }
  };
}
