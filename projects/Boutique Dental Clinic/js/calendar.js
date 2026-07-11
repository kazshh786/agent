/**
 * KS Studio - Dynamic Calendar Widget Component
 */
class StudioCalendar {
  constructor(containerId, detailsBoxId, stateEngine) {
    this.container = document.getElementById(containerId);
    this.detailsBox = document.getElementById(detailsBoxId);
    this.stateEngine = stateEngine;
    
    this.currentDate = new Date();
    // Default to June 2026 for simulation consistency, but allow browsing
    this.displayDate = new Date(2026, 5, 1); // June is month index 5
    
    this.selectedDay = null;
    this.selectedTime = null;
    
    this.init();
  }

  init() {
    this.render();
    this.setupMonthNav();
    this.setupTimeSlots();
  }

  // Setup month previous/next buttons
  setupMonthNav() {
    const prevBtn = document.getElementById('btn-prev-month');
    const nextBtn = document.getElementById('btn-next-month');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.displayDate.setMonth(this.displayDate.getMonth() - 1);
        this.selectedDay = null;
        this.render();
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.displayDate.setMonth(this.displayDate.getMonth() + 1);
        this.selectedDay = null;
        this.render();
      });
    }
  }

  // Setup time slot buttons
  setupTimeSlots() {
    const timeSlots = document.querySelectorAll('.time-slot, md-outlined-button[data-time]');
    timeSlots.forEach(slot => {
      slot.addEventListener('click', () => {
        // Reset slot styles
        timeSlots.forEach(s => {
          s.removeAttribute('disabled');
          s.setAttribute('style', 'width: 100%;');
        });
        
        // Mark active
        slot.setAttribute('style', 'width: 100%; --md-outlined-button-outline-color: var(--color-accent); --md-outlined-button-label-text-color: var(--color-accent);');
        this.selectedTime = slot.getAttribute('data-time');
        
        const timeStr = document.getElementById('selected-time-str');
        if (timeStr) timeStr.textContent = this.selectedTime;
        
        this.checkSubmitState();
      });
    });
  }

  // Render calendar grid
  render() {
    if (!this.container) return;
    
    const year = this.displayDate.getFullYear();
    const month = this.displayDate.getMonth();
    
    // Update Month/Year Header Text
    const headerTitle = document.getElementById('calendar-month-year');
    if (headerTitle) {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      headerTitle.textContent = `${monthNames[month]} ${year}`;
    }
    
    // Clear previous cell contents
    const cells = this.container.querySelectorAll('.day-cell');
    cells.forEach(c => c.remove());
    
    // Find first day of month and total days
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday...
    // Convert to Monday start index (0=Mon, 6=Sun)
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();
    
    // 1. Render previous month's trailing days
    for (let i = startOffset; i > 0; i--) {
      const dayNum = prevTotalDays - i + 1;
      const cell = document.createElement('div');
      cell.className = 'day-cell other-month';
      cell.textContent = dayNum;
      this.container.appendChild(cell);
    }
    
    // 2. Render current month's days
    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement('div');
      cell.textContent = day;
      
      const checkDate = new Date(year, month, day);
      const isPast = checkDate < new Date().setHours(0,0,0,0);
      
      // Setup simple weekend booking simulation
      const dayOfWeek = checkDate.getDay(); // 0=Sun, 6=Sat
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      // Let's mark specific days as booked for simulation realism
      const isBooked = isWeekend || (day % 7 === 3); // Every Wednesday is booked
      
      if (isPast) {
        cell.className = 'day-cell other-month'; // disabled past day look
      } else if (isBooked) {
        cell.className = 'day-cell booked';
      } else {
        cell.className = 'day-cell available';
        cell.setAttribute('data-day', day);
        
        // Click event to select day
        cell.addEventListener('click', () => {
          this.container.querySelectorAll('.day-cell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          this.selectedDay = day;
          
          const dateStr = document.getElementById('selected-date-str');
          if (dateStr) {
            const formatMonth = (month + 1).toString().padStart(2, '0');
            dateStr.textContent = `${year}-${formatMonth}-${day.toString().padStart(2, '0')}`;
          }
          
          this.checkSubmitState();
        });
      }
      
      this.container.appendChild(cell);
    }
    
    // 3. Render next month's leading days
    const totalCells = startOffset + totalDays;
    const remainingCells = 42 - totalCells; // 6 rows of 7 = 42 cells total
    for (let day = 1; day <= remainingCells; day++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell other-month';
      cell.textContent = day;
      this.container.appendChild(cell);
    }
    
    this.checkSubmitState();
  }

  checkSubmitState() {
    const btn = document.getElementById('btn-secure-booking');
    if (!btn) return;
    
    if (this.selectedDay && this.selectedTime) {
      btn.removeAttribute('disabled');
    } else {
      btn.setAttribute('disabled', 'true');
    }
  }

  getSelectedDateString() {
    if (!this.selectedDay) return null;
    const year = this.displayDate.getFullYear();
    const month = (this.displayDate.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}-${this.selectedDay.toString().padStart(2, '0')}`;
  }
}
window.StudioCalendar = StudioCalendar;
