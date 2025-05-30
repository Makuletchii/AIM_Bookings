import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// API base URL configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Department colors for visual differentiation
const departmentColors = {
  'ASITE': 'bg-purple-200',
  'WSGSB': 'bg-green-200',
  'SZGSDM': 'bg-yellow-200',
  'SEELL': 'bg-blue-200',
  'Other Units': 'bg-orange-200',
  'External': 'bg-pink-200'
};


const BookingCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [view, setView] = useState('month');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Fetch bookings from the API
  
  const fetchBookings = async () => {
    try {
      setLoading(true);

      const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const token = localStorage.getItem('authToken');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [bookingsRes, roomsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/bookings?startDate=${startDate}&endDate=${endDate}`, config),
        axios.get(`${API_BASE_URL}/rooms`, config)
      ]);

      const rooms = roomsRes.data;

      const roomMap = {};
      const buildingMap = {};
      rooms.forEach(room => {
        roomMap[room.roomId] = room.roomName;
        buildingMap[room.buildingId] = room.building || room.Building?.buildingName || '';
        if (room.subRooms) {
          room.subRooms.forEach((sub, idx) => {
            roomMap[`${room.roomName}-sub-${idx}`] = sub.roomName;
            buildingMap[`${room.buildingName}-sub-${idx}`] = room.buildingName || '';
          });
        }
      });

      const bookings = Array.isArray(bookingsRes.data)
        ? bookingsRes.data
        : bookingsRes.data.bookings || [];

        const formatted = bookings.map(b => {
          const roomKey = b.roomId;
          return {
            ...b,
            date: b.date,
            time: new Date(b.startTime).toLocaleTimeString([], {
              hour: 'numeric', minute: '2-digit', hour12: true
            }),
            roomName: roomMap[roomKey] || b.roomName || roomKey,
            buildingName: buildingMap[roomKey] || b.building || '',
          };
        });

      setBookings(formatted);
    } catch (err) {
      console.error("Failed to load bookings:", err);
      setError("Failed to load bookings.");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  
useEffect(() => {
  fetchBookings();
  // eslint-disable-next-line
}, [currentMonth, currentYear]);
    

  // Process bookings to account for recurring events
const processedBookings = useMemo(() => {
  const expandedBookings = [];
  bookings.forEach(booking => {
    if (booking.status === 'pending' || booking.status === 'declined') {
      return;
    }
    if (booking.recurring === 'No' || !booking.recurring) {
      expandedBookings.push(booking);
      return;
    }
    const startDate = new Date(booking.date);
    const endDate = booking.recurrenceEndDate 
      ? new Date(booking.recurrenceEndDate) 
      : new Date(currentYear, currentMonth + 1, 0);
    if (startDate > new Date(currentYear, currentMonth + 1, 0) || 
        endDate < new Date(currentYear, currentMonth, 1)) {
      return;
    }
    let currentOccurrence = new Date(Math.max(
      startDate,
      new Date(currentYear, currentMonth, 1)
    ));
    while (currentOccurrence <= endDate && 
           currentOccurrence <= new Date(currentYear, currentMonth + 1, 0)) {
      const occurrenceDate = currentOccurrence.toISOString().split('T')[0];
      expandedBookings.push({
        ...booking,
        date: occurrenceDate,
        isRecurring: true,
        roomName: booking.roomName, // ensure these are copied
        buildingName: booking.buildingName,
      });
      if (booking.recurring === 'Daily') {
        currentOccurrence.setDate(currentOccurrence.getDate() + 1);
      } else if (booking.recurring === 'Weekly') {
        currentOccurrence.setDate(currentOccurrence.getDate() + 7);
      } else if (booking.recurring === 'Monthly') {
        currentOccurrence.setMonth(currentOccurrence.getMonth() + 1);
      }
    }
  });
  return expandedBookings;
}, [bookings, currentMonth, currentYear]);

  useEffect(() => {
    console.log("✅ Processed bookings:", processedBookings);
  }, [processedBookings]);

  useEffect(() => {
    console.log("✅ Raw API bookings:", bookings);
  }, [bookings]);


  const groupBookingsByDate = (bookings) => {
    const grouped = {};
    bookings.forEach((booking) => {
      const date = booking.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(booking);
    });
    return grouped;
  };

  const bookingsByDate = useMemo(() => groupBookingsByDate(processedBookings), [processedBookings]);

  // Navigation functions
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const selectDate = (day) => {
    setSelectedDate(new Date(currentYear, currentMonth, day));
    setView('day');
  };

  const goToPreviousDay = () => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)));
  const goToNextDay = () => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)));
  const backToCalendar = () => setView('month');

  // Format time for display
const formatTime = (timeString) => {
  if (!timeString) return '';
  
  // If AM/PM already, return as-is
  if (/am|pm/i.test(timeString)) return timeString;

  // If it's ISO string with T, extract the time part and convert to AM/PM
  if (timeString.includes('T')) {
    // Parse as UTC so time doesn't get offset
    const date = new Date(timeString);
    if (!isNaN(date)) {
      let hour = date.getUTCHours();
      let minute = date.getUTCMinutes();
      let suffix = 'AM';
      if (hour === 0) { hour = 12; }
      else if (hour === 12) { suffix = 'PM'; }
      else if (hour > 12) { hour -= 12; suffix = 'PM'; }
      return `${hour}:${minute.toString().padStart(2, '0')} ${suffix}`;
    }
  }

  // If it's "HH:mm:ss" or "HH:mm"
  const match = timeString.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    let [h, m] = [parseInt(match[1]), match[2]];
    let suffix = 'AM';
    if (h === 0) { h = 12; }
    else if (h === 12) { suffix = 'PM'; }
    else if (h > 12) { h -= 12; suffix = 'PM'; }
    return `${h}:${m} ${suffix}`;
  }

  // Fallback
  return timeString;
};

  const calculateRecurringDates = (startDate, recurrenceType, endDate) => {
    const dates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
  
    while (currentDate <= end) {
      dates.push(new Date(currentDate).toISOString().split('T')[0]);
  
      if (recurrenceType === 'Daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (recurrenceType === 'Weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (recurrenceType === 'Monthly') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }
  
    return dates;
  };

  // Calendar day cells generation
  const generateDays = () => {
    const days = [];
    const previousMonthDays = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      previousMonthDays.push(
        <div key={`prev-${i}`} className="h-32 border p-1 text-gray-400 bg-gray-50 rounded-xl">
          <span className="text-sm">{new Date(currentYear, currentMonth, 0 - i).getDate()}</span>
        </div>
      );
    }
    days.push(...previousMonthDays.reverse());

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const fullDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayBookings = bookingsByDate[fullDate] || [];
      const hasBookings = dayBookings.length > 0;
      const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
      const isSelected = selectedDate && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();

      days.push(
        <div
          key={day}
          onClick={() => selectDate(day)}
          className={`relative h-32 border cursor-pointer flex flex-col p-2 transition-all duration-200 rounded-xl shadow-sm
            ${isToday ? 'bg-blue-100 text-blue-800 font-semibold' : ''}
            ${isSelected ? 'outline outline-2 outline-blue-500' : 'bg-white hover:bg-blue-50'}`}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={`text-sm ${isToday ? 'bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center' : ''}`}>
              {day}
            </span>
            {hasBookings && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500 text-white whitespace-nowrap">
                {dayBookings.length} {dayBookings.length === 1 ? 'booking' : 'bookings'}
              </span>
            )}

          </div>

          <div className="flex flex-col gap-1">
            {dayBookings.slice(0, 3).map((booking, idx) => (
              <div
                key={idx}
                className={`text-xs p-1 rounded ${departmentColors[booking.department] || 'bg-gray-200'} truncate`}
                title={`${booking.title} (${booking.time}) - ${booking.firstName} ${booking.lastName}`}
              >
                <div className="flex items-center">
                  {booking.status === 'confirmed' && <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>}
                  {booking.status === 'declined' && <div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div>}
                  <span className="truncate">{booking.title}</span>
                </div>
                {booking.isRecurring && (
                  <div className="text-[10px] text-gray-500">↻ {booking.recurring}</div>
                )}
              </div>
            ))}
          </div>


        </div>
      );
    }

    const totalCells = 42;
    const nextMonthDays = totalCells - days.length;
    for (let i = 1; i <= nextMonthDays; i++) {
      days.push(
        <div key={`next-${i}`} className="h-32 border p-1 text-gray-400 bg-gray-50 rounded-xl">
          <span className="text-sm">{i}</span>
        </div>
      );
    }

    return days;
  };


  // Month view rendering
  const renderMonthView = () => {
    if (loading) {
      return <div className="flex items-center justify-center h-full">Loading calendar data...</div>;
    }

    if (error) {
      return <div className="text-red-500 flex items-center justify-center h-full">{error}</div>;
    }

    return (
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-4 px-4 py-2 bg-gray-50 border rounded">
          <div className="flex items-center space-x-2">
          <button onClick={goToPreviousMonth} className="p-2 bg-gray-100 rounded hover:bg-gray-200">
            ←
          </button>
            <div className="flex items-center space-x-2">
              <select
                value={monthNames[currentMonth]}
                onChange={(e) => setCurrentDate(new Date(currentYear, monthNames.indexOf(e.target.value), 1))}
                className="p-2 border rounded"
              >
                {monthNames.map((month, index) => (
                  <option key={index} value={month}>{month}</option>
                ))}
              </select>
              <select
                value={currentYear}
                onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), currentMonth, 1))}
                className="p-2 border rounded"
              >
                {Array.from({ length: 10 }, (_, i) => currentYear - 5 + i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button onClick={goToNextMonth} className="p-2 bg-gray-100 rounded hover:bg-gray-200">
              →
            </button>
          </div>
          <div className="flex items-center">
            {/* Removed status indicators */}
          </div>
          <div className="flex items-center space-x-4">
            {/* Department color legend */}
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(departmentColors).map(([dept, color]) => (
                <span key={dept} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${color} bg-opacity-30 text-gray-800`}>
                  <span className={`w-2 h-2 rounded-full ${color.replace('bg-', 'bg-opacity-100 bg-')}`}></span>
                  {dept}
                </span>
              ))}
            </div>

            
            
          </div>
        </div>
        <div className="grid grid-cols-7 text-center py-2 border-b font-medium text-gray-600">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>
        <div className="grid grid-cols-7 gap-1 py-1 px-1 flex-grow w-full overflow-y-auto">
          {generateDays()}
        </div>
      </div>
    );
  };
  

  // Day view rendering with vertical time slots
const renderDayView = () => {
  if (!selectedDate) return null;

  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedDate = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const dayBookings = processedBookings.filter(booking => booking.date === formattedDate);

  // Group bookings by time string
  const bookingsByTime = {};
  dayBookings.forEach(booking => {
    const start = new Date(booking.startTime);
    // Use the same formatting as timeSlots
    const bookingTimeString = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    if (!bookingsByTime[bookingTimeString]) {
      bookingsByTime[bookingTimeString] = [];
    }
    bookingsByTime[bookingTimeString].push(booking);
  });

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 7; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const formattedHour = hour % 12 || 12;
        const period = hour >= 12 ? 'PM' : 'AM';
        const formattedMinute = minute.toString().padStart(2, '0');
        const timeString = `${formattedHour}:${formattedMinute} ${period}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const uniqueTimeSlots = [...new Set(dayBookings.map(
  booking => `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`
  ))].sort((a, b) => {
    // Sort by real time
    const getStart = s => {
      const [start] = s.split(' - ');
      const [h, m, suffix] = start.match(/(\d+):(\d+)\s?(AM|PM)/i).slice(1);
      return (parseInt(h) % 12 + (suffix.toUpperCase() === "PM" ? 12 : 0)) * 60 + parseInt(m);
    };
    return getStart(a) - getStart(b);
  });


  const timeSlots = generateTimeSlots();
  const renderedBookings = new Set();

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 px-4 py-2 bg-gray-100 border rounded">
        <div>
          <h2 className="text-lg font-bold">{`${dayOfWeek[selectedDate.getDay()]}, ${formattedDate}`}</h2>
          <p className="text-sm text-gray-600">{dayBookings.length} bookings</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={goToPreviousDay} className="p-2 bg-gray-200 rounded hover:bg-gray-300">← Previous</button>
          <button onClick={goToNextDay} className="p-2 bg-gray-200 rounded hover:bg-gray-300">Next →</button>
          <button onClick={backToCalendar} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Back to Calendar</button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto">
        {dayBookings.length > 0 && (
          <h3 className="font-semibold mb-4">Daily Schedule</h3>
        )}

        {dayBookings.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center text-gray-500 italic">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 12a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0zM9 10h6m-6 4h3" />
            </svg>
            <h4 className="text-2xl font-semibold mb-1">No bookings for this day</h4>
          </div>
        )}

        <div className="border rounded">
          {uniqueTimeSlots.map((slot, idx) => {
            const [start, end] = slot.split(' - ');
            const slotBookings = dayBookings.filter(
              b => formatTime(b.startTime) === start && formatTime(b.endTime) === end
            );
            return (
              <div key={slot} className="flex border-b bg-white">
                <div className="w-40 border-r text-sm font-medium px-1 flex items-center justify-center min-h-[90px]">
                  <span className="whitespace-nowrap">
                    ⏰{slot}
                  </span>
                </div>
                <div className="flex-grow p-2">
                  {slotBookings.map((booking, bidx) => (
                    <div
                      key={booking.bookingId + '_' + booking.roomId + '_' + booking.startTime}
                      className={`relative p-3 mb-2 rounded-md text-base text-gray-800 shadow-sm border border-blue-300 ${departmentColors[booking.department] || 'bg-blue-100'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-lg">{booking.roomName}</span>
                        <span
                          className={`text-sm px-2 py-1 rounded-full text-white ${
                            booking.status === 'confirmed' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        >
                          {booking.status}
                        </span>
                      </div>
                      <p className="text-base font-semibold">{booking.title}</p>
                      <p className="text-base font-semibold">{booking.firstName} {booking.lastName}</p>
                      <p className="text-sm text-gray-800">Building: {booking.buildingName}</p>
                      <p className="text-sm italic text-gray-700">
                        ⏰{formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                      </p>
                      {booking.isRecurring && (
                        <p className="text-sm italic text-gray-500">↻ Recurs: {booking.recurring}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

  
  return (
    <div className="fixed top-0 left-60 right-0 bottom-0 overflow-hidden">
      <div className="h-full w-full px-0 flex">
        <div className="h-full w-full max-w-screen-2xl w-full overflow-auto px-4 overflow-visible">
          {view === 'month' ? renderMonthView() : renderDayView()}
        </div>
      </div>
    </div>
  );
  
  
};

export default BookingCalendar;
