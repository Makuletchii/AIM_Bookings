import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import axios from 'axios';
import bg from '../../images/bg.png';
import { useLocation, useNavigate } from 'react-router-dom';
import Confirm from "../../components/ui/ConfirmationModal";  

const API_BASE_URL = 'http://localhost:5000/api';

const TIME_OPTIONS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM',
  '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM',
];

const convertTo24HourFormat = (time12h) => {
  if (!time12h) return '';

  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');

  if (hours === '12') {
    hours = modifier === 'PM' ? '12' : '00';
  } else {
    hours = modifier === 'PM' ? String(parseInt(hours, 10)  +12) : hours.padStart(2, '0');
  }

  // Ensure seconds are always included
  return `${hours}:${minutes}:00`;
};

const toTimeHHMM = (time12h) => {
  if (!time12h) return '';
  
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours, 10);
  
  // Convert hours to 24-hour format
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  
  // Format to HH:MM with leading zeros
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const toTimeISOString = (time12h) => {

  if (!time12h) return '';
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours, 10);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  // Always UTC for time-only
  return new Date(Date.UTC(2025, 0, 1, hours, parseInt(minutes, 10))).toISOString();
};
 
const BookingForm = ({onBookingSubmit, setSelectedRoomId, setSelectedRoomName, selectedRoomId, availableIntervals = []}) => {
  // ...
  const location = useLocation();
  const bookingData = location.state?.bookingData;
  const navigate = useNavigate(); // Initialize the navigate function
  
  const handleGoBack = () => {
    navigate(-1); // Navigate to the previous page
  };
  
  const [formData, setFormData] = useState({
    title: '',
    firstName: '',
    lastName: '',
    email: '',
    buildingId: '',
    buildingName: '', // Add this field to store the name
    categoryId: '',
    categoryName: '', // Add this field to store the name
    roomId: '',
    date: format(new Date(), 'yyyy-MM-dd'), 
    startTime: '09:00 AM',
    endTime: '10:00 AM',
    department: '',
    isRecurring: false,
    recurrenceType: '',
    recurrenceDays: [],
    recurrenceEndDate: '',
    notes: '',
    isMealRoom: false,
    isBreakRoom: false,
    bookingCapacity: 1,
    status: 'pending'
  });

  const [rooms, setRooms] = useState([]);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useLocalData, setUseLocalData] = useState(false);
  const [existingBookings, setExistingBookings] = useState([]);
  const [unavailableTimeSlots, setUnavailableTimeSlots] = useState([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [roomMap, setRoomMap] = useState({});
  const [blockedTimes, setBlockedTimes] = useState([]);

  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('role');

  // Predefined departments array
  const departments = ['ASITE', 'WSGSB', 'SZGSDM', 'SEELL', 'Other Units', 'External'];

  // Apply booking data from AccRooms if available
  useEffect(() => {
    if (bookingData) {
      const { room, searchParams } = bookingData;

      // Ensure room and building data are properly set
      if (room) {
        setFormData((prevFormData) => ({
          ...prevFormData,
          buildingId: room.buildingId || '',
          categoryId: room.categoryId || '',
          roomId: room.roomId || '',
        }));
      }

      // Ensure searchParams are properly set
      if (searchParams) {
        setFormData((prevFormData) => ({
          ...prevFormData,
          date: searchParams.fromDate || format(new Date(), 'yyyy-MM-dd'),
          startTime: searchParams.fromTime || '09:00 AM',
          endTime: searchParams.toTime || '10:00 AM',
          isRecurring: searchParams.isRecurring || false,
        }));
      }
    }
  }, [bookingData]);

  // Fetch user data and populate the form
  const fetchUserData = async () => {
    try {
      console.log(`Fetching user data for userId: ${userId}`);
      
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.statusText}`);
      }
      
      const userData = await response.json();

      // Update form data with user information
      setFormData((prevFormData) => ({
        ...prevFormData,
        firstName: userData.firstName,
        lastName: userData.lastName,
        department: userData.department || '',
        email: userData.email,
      }));
    } catch (error) {
      console.error('Error fetching user data:', error);

      // If API fails, try to use localStorage data
      setUseLocalData(true);

      const firstName = localStorage.getItem('firstName') || '';
      const lastName = localStorage.getItem('lastName') || '';
      const email = localStorage.getItem('email') || '';

      setFormData((prevFormData) => ({
        ...prevFormData,
        firstName,
        lastName,
        email,
        department: 'ICT', // Default department
      }));

      setError('Could not fetch profile data from server. Using available local data.');
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserData();
    } else {
      setError('User ID not found. Please log in again.');
    }
  }, [userId, token, userRole]);

  // Fetch rooms data
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/rooms`);
        
        // Map the API response to include the nested name properties
        const processedRooms = response.data.map(room => ({
          ...room,
          // Extract name from nested objects
          buildingName: room.Building?.buildingName || room.buildingName || room.buildingId,
          categoryName: room.Category?.categoryName || room.categoryName || room.categoryId
        }));
        
        setRooms(processedRooms);
        console.log("Processed rooms data:", processedRooms);
        
        // Extract unique buildings with names from the nested structure
        const uniqueBuildings = [];
        const buildingsMap = {};
        
        processedRooms.forEach(room => {
          if (!buildingsMap[room.buildingId]) {
            buildingsMap[room.buildingId] = true;
            uniqueBuildings.push({
              id: room.buildingId,
              name: room.Building?.buildingName || room.buildingName || room.buildingId
            });
          }
        });
        
        // Sort buildings by name
        uniqueBuildings.sort((a, b) => a.name.localeCompare(b.name));
        console.log("Processed buildings:", uniqueBuildings);
        setBuildings(uniqueBuildings);
        
        // Create a map of room IDs to room data with proper names
        const newRoomMap = {};
        processedRooms.forEach(room => {
          newRoomMap[room.roomId] = {
            roomName: room.roomName,
            buildingId: room.buildingId,
            buildingName: room.Building?.buildingName || room.buildingName || room.buildingId,
            categoryId: room.categoryId,
            categoryName: room.Category?.categoryName || room.categoryName || room.categoryId
          };
        });
        setRoomMap(newRoomMap);
      } catch (err) {
        console.error('Error fetching rooms:', err);
        setError('Failed to fetch rooms. Please try again.');
      }
    };

    fetchRooms();
  }, []);
  
  // Update categories when building changes
  useEffect(() => {
    if (formData.buildingId && rooms.length > 0) {
      const buildingRooms = rooms.filter(room => room.buildingId === formData.buildingId);
      
      // Extract unique categories with both ID and display name from nested data
      const uniqueCategories = [];
      const categoryMap = {};
      
      buildingRooms.forEach(room => {
        if (!categoryMap[room.categoryId]) {
          categoryMap[room.categoryId] = true;
          uniqueCategories.push({
            id: room.categoryId,
            name: room.Category?.categoryName || room.categoryName || room.categoryId
          });
        }
      });
      
      // Sort categories by name
      uniqueCategories.sort((a, b) => a.name.localeCompare(b.name));
      console.log("Categories for building:", uniqueCategories);
      setCategories(uniqueCategories);
    } else {
      setCategories([]);
    }
  }, [formData.buildingId, rooms]);

  // Fetch users from the API
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(response.data);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };

    fetchUsers();
  }, [token]);

  // Fetch existing bookings
  const fetchBookings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching bookings: ${response.statusText}`);
      }
      
      const data = await response.json();
      const bookings = data.bookings || data;

      const enrichedBookings = bookings.map(booking => {
        const roomData = roomMap[booking.roomId];
        return {
          ...booking,
          roomName: roomData?.roomName || booking.roomId,
          buildingId: roomData?.buildingId || booking.buildingId,
        };
      });

      setExistingBookings(enrichedBookings);
      processBookingsForTimeSlots(enrichedBookings);
    } catch (err) {
      console.error('Error fetching bookings:', err);
    }
  };

  useEffect(() => {
    if (formData.buildingId && formData.roomId && formData.date && rooms.length > 0) {
      fetchBookings(); // Fetch bookings data for all rooms
    }
  }, [formData.buildingId, formData.roomId, formData.date, rooms]);

  const processBookingsForTimeSlots = (bookings) => {
    if (!bookings || !formData.buildingId || !formData.roomId || !formData.date) return;
  
    // Clear previous unavailable time slots
    setUnavailableTimeSlots([]);
  
    // Filter bookings for the selected building and room
    const relevantBookings = bookings.filter(booking =>
      booking.buildingId === formData.buildingId &&
      new Date(booking.startTime).toDateString() === new Date(`${formData.date}T00:00:00`).toDateString() &&
      booking.status?.toLowerCase() === 'confirmed'
    );
  
    const unavailable = [];
  
    relevantBookings.forEach(booking => {
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      const bufferEnd = new Date(bookingEnd.getTime() + 30 * 60 * 1000); // 30min buffer
  
      const formatTimeToOption = (date) => {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
      };
  
      TIME_OPTIONS.forEach(timeOption => {
        const timeOption24 = convertTo24HourFormat(timeOption);
        const timeOptionDate = new Date(`${formData.date}T${timeOption24}:00`);
  
        // Check if the time slot is already unavailable
        if (timeOptionDate >= bookingStart && timeOptionDate < bufferEnd) {
          unavailable.push({
            time: timeOption,
            reason: `Booking: ${formatTimeToOption(bookingStart)} - ${formatTimeToOption(bookingEnd)} (Already booked)`
          });
        }
      });
    });
  
    // Update unavailable time slots
    setUnavailableTimeSlots(unavailable);
  };
  
  // Filter rooms based on building and category
  useEffect(() => {
    if (formData.buildingId && formData.categoryId) {
      const filtered = rooms.filter(
        (room) =>
          room.buildingId.toString() === formData.buildingId.toString() &&
          room.categoryId.toString() === formData.categoryId.toString()
      );
      
      // Sort rooms by name
      filtered.sort((a, b) => a.roomName.localeCompare(b.roomName));
      setFilteredRooms(filtered);
    } else {
      setFilteredRooms([]);
    }
  }, [formData.buildingId, formData.categoryId, rooms]);

  // Handle fallback to local data for testing
  useEffect(() => {
    if (useLocalData && userId === '67f35bf80888a27d080e2eb0') {
      setFormData((prevFormData) => ({
        ...prevFormData,
        firstName: 'John',
        lastName: 'Jones',
        email: 'johnjones@gmail.com',
        department: 'ICT',
      }));
    }
  }, [useLocalData, userId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
  
    if (name === 'buildingId') {
      const selectedBuilding = buildings.find(b => b.id === value) || { name: '' };
      console.log("Selected building:", selectedBuilding); // Debug log
  
      setFormData({
        ...formData,
        [name]: value, // Set the buildingId correctly
        buildingName: selectedBuilding.name, // Set the buildingName from the selected building
        categoryId: '', // Reset categoryId when building changes
        categoryName: '', // Reset categoryName when building changes
        roomId: '', // Reset roomId when building changes
      });
      setAvailabilityStatus(null); // Reset availability status
    } else if (name === 'categoryId') {
      const selectedCategory = categories.find(c => c.id === value) || { name: '' };
  
      setFormData({
        ...formData,
        [name]: value, // Set the categoryId correctly
        categoryName: selectedCategory.name, // Set the categoryName from the selected category
        roomId: '', // Reset roomId when category changes
      });
      setAvailabilityStatus(null);
    } else if (name === 'roomId') {
      const selectedRoom = roomMap[value] || {};
      setFormData({
        ...formData,
        [name]: value, // Set the roomId correctly
        roomName: selectedRoom.roomName || '', // Set the roomName from the selected room
      });
      setAvailabilityStatus(null);

        if (setSelectedRoomId) setSelectedRoomId(value);
        if (setSelectedRoomName) setSelectedRoomName(selectedRoom.roomName || '');
  
      // Check availability after a short delay
      if (formData.buildingId && value && formData.date && formData.startTime && formData.endTime) {
        checkTimeAvailability({
          ...formData,
          [name]: value,
        });
      }
    } else if (name === 'date' || name === 'startTime' || name === 'endTime') {
      setFormData({
        ...formData,
        [name]: value, // Update the respective field
      });
      setAvailabilityStatus(null);
  
      // Check availability after a short delay
      if (formData.buildingId && formData.roomId && formData.date &&
          (name === 'roomId' || name === 'date' || name === 'startTime' || name === 'endTime')) {
        checkTimeAvailability({
          ...formData,
          [name]: value,
        });
      }
    } else {
      setFormData({
        ...formData,
        [name]: type === 'checkbox' ? checked : value, // Handle other fields
      });
    }
  };

  const checkTimeAvailability = async (data) => {
    if (!data.date || !data.startTime || !data.endTime || !data.roomId || !data.categoryId) {
      setAvailabilityStatus({
        available: false,
        message: 'Please provide a valid date, room, start time, end time, and category.',
      });
      return;
    }
  
    setIsCheckingAvailability(true);
  
    try {
      // Convert times to proper format for API
      const startTime24 = convertTo24HourFormat(data.startTime);
      const endTime24 = convertTo24HourFormat(data.endTime);
  
      // Ensure the time format is correct (HH:MM:SS) as required by backend validation
      const formattedStartTime = startTime24.includes(':') && startTime24.split(':').length === 2 
        ? `${startTime24}:00` 
        : startTime24;
        
      const formattedEndTime = endTime24.includes(':') && endTime24.split(':').length === 2 
        ? `${endTime24}:00` 
        : endTime24;

      // Log the payload being sent to the API
      console.log('Payload for availability check:', {
        buildingId: data.buildingId,
        roomId: data.roomId,
        categoryId: data.categoryId,
        date: data.date,
        startTime: formattedStartTime,
        endTime: formattedEndTime,
      });
  
      // Call the availability check endpoint using fetch
      const response = await fetch(`${API_BASE_URL}/bookings/check-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          buildingId: data.buildingId,
          roomId: data.roomId,
          categoryId: data.categoryId,
          date: data.date,
          startTime: formattedStartTime,
          endTime: formattedEndTime,
        })
      });

      if (!response.ok) {
        throw new Error(`Error checking availability: ${response.statusText}`);
      }

      const responseData = await response.json();
      setAvailabilityStatus(responseData);
    } catch (err) {
      console.error('Error checking availability:', err);
      setAvailabilityStatus({
        available: false,
        message: err.message || 'Error checking availability. Please try again.',
      });
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const isTimeSlotUnavailable = (time) => {
    return unavailableTimeSlots.some(slot => slot.time === time);
  };

  const getTimeSlotTooltip = (time) => {
    const unavailableSlot = unavailableTimeSlots.find(slot => slot.time === time);
    return unavailableSlot ? unavailableSlot.reason : '';
  };

  // Helper to convert minutes to time string (e.g. 8:00 AM)
  const minutesToTime = (minutes) => {
    let h = Math.floor(minutes / 60);
    let m = minutes % 60;
    let suffix = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
  };

  const getCurrentMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };

  // Only show interval starts as start times
  const getAvailableStartTimes = () => {
    if (!availableIntervals || availableIntervals.length === 0) return [];

    // Calculate if the booking is for today
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isToday = formData.date === todayStr;
    const currentMinutes = getCurrentMinutes();

    const times = [];
    availableIntervals.forEach(({ start, end }) => {
      for (let t = start; t + 30 <= end; t += 30) {
        // If it's today, only show times in the future
        if (!isToday || t > currentMinutes) {
          times.push(minutesToTime(t));
        }
      }
    });
    return times;
};
  
  const isTimeBlocked = (time) => {
    if (!unavailableTimeSlots.length) return false;
  
    const time24 = convertTo24HourFormat(time);
    const timeDate = new Date(`${formData.date}T${time24}:00`);
  
    return unavailableTimeSlots.some(slot => {
      const slotTime24 = convertTo24HourFormat(slot.time);
      const slotDate = new Date(`${formData.date}T${slotTime24}:00`);
      return timeDate.getTime() === slotDate.getTime();
    });
  };
  
const getFilteredEndTimes = () => {
  if (!formData.startTime) return [];
  // Find the interval that contains the selected start time
  const toMinutes = (timeString) => {
    const [time, period] = timeString.split(" ");
    let [h, m] = time.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };
  const startMinutes = toMinutes(formData.startTime);

  const interval = availableIntervals.find(
    ({ start, end }) => start <= startMinutes && startMinutes < end
  );
  if (!interval) return [];

  // Show 30-min increments from start+30 up to interval end
  const times = [];
  for (let t = startMinutes + 30; t <= interval.end; t += 30) {
    times.push(minutesToTime(t));
  }
  return times;
};


  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.startTime || !formData.endTime || !formData.roomId || !formData.buildingId || !userId) {
      setError('All fields (startTime, endTime, roomId, buildingId, and userId) are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Convert times to proper format for SQL (HH:mm:ss)
      const startTimeSQL = convertTo24HourFormat(formData.startTime);
      const endTimeSQL = convertTo24HourFormat(formData.endTime);

      // Log the converted times for debugging
      console.log('Converted Start Time:', startTimeSQL);
      console.log('Converted End Time:', endTimeSQL);

      // Format timeSubmitted in a SQL Server-friendly format without timezone
      const now = new Date();
      const timeSubmitted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const bookingPayload = {
        userId,
        title: formData.title,
        firstName: formData.firstName,
        lastName: formData.lastName,
        buildingId: formData.buildingId,
        categoryId: formData.categoryId,
        roomId: formData.roomId,
        date: formData.date,
        startTime: startTimeSQL,
        endTime: endTimeSQL,
        department: formData.department,
        isRecurring: formData.isRecurring,
        recurrenceEndDate: formData.recurrenceEndDate === '' ? null : formData.recurrenceEndDate,
        notes: formData.notes === '' ? null : formData.notes,
        isMealRoom: formData.isMealRoom,
        isBreakRoom: formData.isBreakRoom,
        bookingCapacity: formData.bookingCapacity,
        status: formData.status,
        // Do NOT send timeSubmitted
      };

      console.log('Booking Payload:', bookingPayload); // <-- Only this line

      const response = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(bookingPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create booking.');
      }

      const data = await response.json();
      onBookingSubmit(data);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans">
      <div className="px-4 pb-8">
        {/* Background */}
        <div className="fixed inset-0 z-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${bg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundAttachment: "fixed",
            }}
          />
          <div className="absolute inset-0 bg-black bg-opacity-10" />
        </div>

        <div className="relative bg-white rounded-lg shadow-md p-8 max-w-xl mx-auto">  
            <h2 className="text-2xl font-bold mb-1 text-gray-800">Create New Booking</h2>
            <p className="text-xs text-gray-500 italic text-center mb-6">
              Fields marked with <span className="text-red-500">*</span> are required.
            </p>
         
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            {/* Booking Title */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">
                Event Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter a title for your booking"
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Building Selection */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">
                Building <span className="text-red-500">*</span>
              </label>
              <select
                name="buildingId"
                value={formData.buildingId}
                onChange={handleChange}
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Building</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selection */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={!formData.buildingId}
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Room Selection */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">
                Meeting Room <span className="text-red-500">*</span>
              </label>
              <select
                name="roomId"
                value={formData.roomId}
                onChange={handleChange}
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={!formData.categoryId}
              >
                <option value="">Select Room</option>
                {filteredRooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.roomName}
                  </option>
                ))}
              </select>
            </div>

            {/* Number of Pax */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">
                Number of Pax <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="bookingCapacity"
                value={formData.bookingCapacity}
                onChange={handleChange}
                placeholder="Enter number of participants"
                min={1}
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

             {/* Date*/}
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Date of Booking <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={handleChange}
                    style={{ textAlign: 'center', width: '100%', padding: '1rem', border: '1px solid #ccc', borderRadius: '0.5rem', outline: 'none' }}
                  className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

            {/* Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 mt-6">
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <select
                  name="startTime"
                  value={formData.startTime}
                  onChange={handleChange}
                  className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Start Time</option>
                  {getAvailableStartTimes().map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  End Time <span className="text-red-500">*</span>
                </label>
                <select
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={!formData.startTime}
                >
                  <option value="">Select End Time</option>
                  {getFilteredEndTimes().map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

             {/* Additional Room Options */}
            <div className="text-center">
              <label className="text-xl block text-gray-700 font-medium mb-6">
                Other Request <span className="text-red-500"></span>
              </label>
            </div>

            {/* Additional Room Options */}
            <div className="mb-6 flex flex-wrap gap-6 justify-center">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isMealRoom"
                  name="isMealRoom"
                  checked={formData.isMealRoom}
                  onChange={handleChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isMealRoom" className="ml-2 text-gray-700 font-medium">
                  Request a Meal Room
                </label>
              </div>
              
                <div className="flex items-center justify-center mb-2">
                  <input
                    type="checkbox"
                    id="isBreakRoom"
                    name="isBreakRoom"
                    checked={formData.isBreakRoom}
                    onChange={handleChange}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isBreakRoom" className="ml-2 text-gray-700 font-medium">
                    Request a Breakout Room
                  </label>
              </div>
            </div>

            {formData.isBreakRoom && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 mt-4">
                {/* Number of Pax for Breakout Room */}
                <div className="md:col-span-2">
                  <label className="block text-gray-700 font-medium mb-2">
                    Number of Pax (Breakout Room) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="numberOfPaxBreakRoom"
                    value={formData.numberOfPaxBreakRoom || ''}
                    onChange={handleChange}
                    min={1}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter number of participants for breakout room"
                    required={formData.isBreakRoom}
                  />
                </div>
                {/* Start Time for Breakout Room */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Breakout Room Start Time <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="startTimeBreakRoom"
                    value={formData.startTimeBreakRoom || ''}
                    onChange={handleChange}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required={formData.isBreakRoom}
                  >
                    <option value="">Select Start Time</option>
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                {/* End Time for Breakout Room */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Breakout Room End Time <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="endTimeBreakRoom"
                    value={formData.endTimeBreakRoom || ''}
                    onChange={handleChange}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required={formData.isBreakRoom}
                    disabled={!formData.startTimeBreakRoom}
                  >
                    <option value="">Select End Time</option>
                    {/* You can use a filter here if you want to only allow times after start time */}
                    {TIME_OPTIONS
                      .filter(
                        (time) =>
                          !formData.startTimeBreakRoom ||
                          TIME_OPTIONS.indexOf(time) > TIME_OPTIONS.indexOf(formData.startTimeBreakRoom)
                      )
                      .map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Recurring Booking Options */}
            <div className="mb-6">
              <div className="flex items-center justify-center mb-2">
                <input
                  type="checkbox"
                  id="isRecurring"
                  name="isRecurring"
                  checked={formData.isRecurring}
                  onChange={handleChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isRecurring" className="ml-2 text-gray-700 font-medium">
                  Make this a recurring booking
                </label>
              </div>
              
              {formData.isRecurring && (
                <div className="pl-6 border-l-2 border-gray-200 mt-3 space-y-4">
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      Recurrence Type
                    </label>
                    <select
                      name="recurrenceType"
                      value={formData.recurrenceType}
                      onChange={handleChange}
                      className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={formData.isRecurring}
                    >
                      <option value="">Select Type</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      End Recurrence Date
                    </label>
                    <input
                      type="date"
                      name="recurrenceEndDate"
                      value={formData.recurrenceEndDate}
                      onChange={handleChange}
                      min={formData.date}
                      className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={formData.isRecurring} // Only required if "isRecurring" is true
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Additional Notes */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">Special Instructions</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Any special requirements or information..."
                rows="4"
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Store the user info in hidden fields */}
            <input type="hidden" name="firstName" value={formData.firstName} />
            <input type="hidden" name="lastName" value={formData.lastName} />
            <input type="hidden" name="email" value={formData.email} />
            <input type="hidden" name="department" value={formData.department} />

            {/* Availability Status */}
            {availabilityStatus && (
              <div className={`mb-6 p-4 rounded ${
                availabilityStatus.available 
                  ? 'bg-green-100 border border-green-400 text-green-700' 
                  : 'bg-yellow-100 border border-yellow-400 text-yellow-700'
              }`}>
                {availabilityStatus.message}
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={handleGoBack}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Go Back
              </button>
              <button
                type="submit"
                className={`px-6 py-3 ${
                  availabilityStatus?.available ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'
                } text-white rounded-lg`}
                disabled={loading || isCheckingAvailability || !availabilityStatus?.available}
              >
                {loading ? 'Submitting...' : isCheckingAvailability ? 'Checking Availability...' : 'Submit Booking'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookingForm;