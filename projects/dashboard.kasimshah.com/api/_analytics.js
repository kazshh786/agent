const FUNNEL_EVENTS=['page_view','booking_cta_clicked','booking_page_viewed','booking_started','service_selected','slot_selected','customer_details_submitted','payment_started','payment_completed','booking_confirmed','booking_confirmed_no_payment'];

function summarizeEvents(events,days){
  const counts=Object.fromEntries(FUNNEL_EVENTS.map(name=>[name,0]));const sessions=new Set();let revenueMinor=0;const currencies=new Set();
  (events||[]).forEach(event=>{sessions.add(event.session_id);if(counts[event.event_name]!==undefined)counts[event.event_name]++;if(event.event_name==='payment_completed'&&event.value_minor){revenueMinor+=event.value_minor;if(event.currency)currencies.add(event.currency);}});
  const confirmed=counts.booking_confirmed+counts.booking_confirmed_no_payment;
  return {rangeDays:days,sessions:sessions.size,funnel:counts,confirmedBookings:confirmed,
    bookingConversionRate:sessions.size?Number((confirmed/sessions.size*100).toFixed(2)):0,
    ctaConversionRate:counts.page_view?Number((counts.booking_cta_clicked/counts.page_view*100).toFixed(2)):0,
    revenueMinor,currency:currencies.size===1?[...currencies][0]:null,dataLimited:(events||[]).length===50000};
}

module.exports={FUNNEL_EVENTS,summarizeEvents};
