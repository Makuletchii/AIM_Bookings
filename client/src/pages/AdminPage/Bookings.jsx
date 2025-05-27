import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import TopBar from '../../components/AdminComponents/TopBar';
import StatusModal from './modals/StatusModal';
import ExcelEventBulletinExporter from '../../components/AdminComponents/ExportCSV';



const formatDate = (date) => {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(date).toLocaleDateString(undefined, options);
};

const parseISODate = (dateString) => {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

// Convert from 12-hour format (e.g. "8:00 AM") to 24-hour format (e.g. "08:00:00")
const convertTo24HourFormat = (time12h) => {
  if (!time12h) return '';
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = modifier === 'PM' ? '12' : '00';
  } else {
    hours = modifier === 'PM' ? String(parseInt(hours, 10) + 12) : hours.padStart(2, '0');
  }
  // Always return with seconds for SQL Server
  return `${hours}:${minutes}:00`;
};

// Base API URL
const API_BASE_URL = 'http://localhost:5000/api';

// Predefined options for dropdowns
const DEPARTMENTS = ['ASITE', 'WSGSB', 'SZGSDM', 'SEELL', 'Other Units', 'External'];

// Initial form state
const initialFormState = {
  title: '',
  firstName: '',
  lastName: '',
  userId: null,
  categoryId: '',
  roomId: null,
  buildingId: '',
  date: new Date().toISOString().split('T')[0],  
  startTime: null,
  endTime: null,
  notes: '',
  isRecurring: false,
  recurrenceEndDate: '',
  status: 'pending',
  bookingCapacity: 1,
  isMealRoom: false,
  isBreakRoom: false,
  remarks: '',
  bookingId: null,
  numberOfPaxBreakRoom: '',
  startTimeBreakRoom: '',
  endTimeBreakRoom: '',
};

// Time options for dropdowns
const TIME_OPTIONS = [
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', 
  '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM',
];

// Tab Button Component
const TabButton = ({ label, active, onClick }) => (
  <button
    className={`px-4 py-2 font-medium rounded-lg transition ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

const Bookings = () => {
  // State for bookings data and filtering
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBookingTab, setActiveBookingTab] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for modal controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editBookingId, setEditBookingId] = useState(null);
  
  // State for room data
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  
  // New state for buildings and categories from API
  const [buildings, setBuildings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  
  // Get token from localStorage
  const token = localStorage.getItem('token');
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // Add these missing state declarations
  const [formData, setFormData] = useState({...initialFormState});
  const [formError, setFormError] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError('');
      
      try {
        console.log("Fetching rooms data for setup...");
        
        // First fetch all rooms to extract building and category information
        const roomsResponse = await axios.get(`${API_BASE_URL}/rooms`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Store rooms data
        const roomsData = roomsResponse.data;
        console.log("Rooms data:", roomsData);
        setRooms(roomsData);
        
        // Process buildings data consistently
        const buildingsMap = {};
        roomsData.forEach(room => {
          if (room.buildingId) {
            const buildingId = room.buildingId.toString();
            const buildingName = room.Building?.buildingName || room.building || `Building ${buildingId}`;
            
            if (!buildingsMap[buildingId]) {
              buildingsMap[buildingId] = {
                id: buildingId,
                name: buildingName
              };
            }
          }
        });
        
        // Convert to array for the dropdown
        const buildingsList = Object.values(buildingsMap);
        console.log("Extracted buildings:", buildingsList);
        setBuildings(buildingsList);
        
        // Next, fetch bookings
        const bookingsResponse = await axios.get(`${API_BASE_URL}/bookings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Map booking data with room and building information
        const bookingsData = await Promise.all(
          bookingsResponse.data.map(async (booking) => {
            // Find room info for this booking
            const room = roomsData.find(r => r.roomId === booking.roomId) || {};
            
            // Get user info if needed
            let userData = {};
            if (booking.userId) {
              try {
                const userRes = await axios.get(`${API_BASE_URL}/users/${booking.userId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                userData = userRes.data;
              } catch (error) {
                console.error(`Could not fetch user data for ID ${booking.userId}`, error);
              }
            }
            
            return {
              ...booking,
              roomName: room.roomName || 'Unknown Room',
              building: room.Building?.buildingName || room.building || 'Unknown Building',
              buildingId: room.buildingId || '',
              category: room.Category?.categoryName || room.category || 'Unknown Category',
              categoryId: room.categoryId || '',
              firstName: booking.firstName || userData.firstName || '',
              lastName: booking.lastName || userData.lastName || '',
              department: booking.department || '',
              email: userData.email || '',
              startTime: booking.startTime, // keep original DB format!
              endTime: booking.endTime,
              recurring: booking.isRecurring ? 'Yes' : 'No'
            };
          })
        );
        
        setBookings(bookingsData);
        
        // Also fetch users for dropdown
        const usersResponse = await axios.get(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setUsers(usersResponse.data);
        
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [token]);

  // Add this function to your component

  const fetchBookings = async () => {
    try {
      setLoading(true);
      
      // Fetch rooms first to have room data available
      const roomsResponse = await axios.get(`${API_BASE_URL}/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const roomsData = roomsResponse.data;
      setRooms(roomsData);
      
      // Then fetch bookings
      const bookingsResponse = await axios.get(`${API_BASE_URL}/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Map booking data with room information
      const bookingsData = await Promise.all(
        bookingsResponse.data.map(async (booking) => {
          const room = roomsData.find(r => r.roomId === booking.roomId) || {};
          
          // Get user info if needed
          
          
          return {
            ...booking,
            roomName: room.roomName || 'Unknown Room',
            building: room.Building?.buildingName || room.building || 'Unknown Building',
            buildingId: room.buildingId || '',
            category: room.Category?.categoryName || room.category || 'Unknown Category',
            categoryId: room.categoryId || '',
            firstName: userData.firstName || booking.firstName || '',
            lastName: userData.lastName || booking.lastName || '',
            department: userData.department || booking.department || '',
            email: userData.email || '',
              startTime: booking.startTime ? convertTo24HourFormat(booking.startTime) : '',
              endTime: booking.endTime ? convertTo24HourFormat(booking.endTime) : '',
            recurring: booking.isRecurring ? 'Yes' : 'No'
          };
        })
      );
      
      setBookings(bookingsData);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError('Failed to load bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter bookings based on active tab
  const filteredBookings = useMemo(() => {
    if (activeBookingTab === 'all') return bookings;

    return bookings.filter(booking => {
      if (activeBookingTab === 'pending') return booking.status === 'pending';
      if (activeBookingTab === 'confirmed') return booking.status === 'confirmed';
      if (activeBookingTab === 'declined') return booking.status === 'declined';
      return true;
    });
  }, [bookings, activeBookingTab]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const indexOfLastBooking = currentPage * itemsPerPage;
  const indexOfFirstBooking = indexOfLastBooking - itemsPerPage;
  const currentBookings = filteredBookings.slice(indexOfFirstBooking, indexOfLastBooking);

  // Pagination handlers
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Modal handlers
  const handleAddNewClick = () => {
    resetForm();
    setIsAddModalOpen(true);
  };
  
const handleEditClick = async (booking) => {
  console.log('Editing booking:', booking);

  // Always fetch the latest bookings before opening modal
  await fetchBookings();

  setFormData({
    ...booking,
    date: parseISODate(booking.date),
    startTime: formatTime(booking.startTime),
    endTime: formatTime(booking.endTime), 
    isRecurring: booking.isRecurring || booking.recurring === 'Yes',
    recurring: booking.isRecurring ? 'Yes' : 'No',
    recurrenceEndDate: booking.recurrenceEndDate ? parseISODate(booking.recurrenceEndDate) : '',
    isMealRoom: booking.isMealRoom || false,
    isBreakRoom: booking.isBreakRoom || false,
  });

  setEditBookingId(booking.bookingId);

  // Get the building ID from the booking
  const buildingId = booking.buildingId || '';

  if (buildingId && rooms.length > 0) {
    // Find rooms in this building
    const roomsInBuilding = rooms.filter(room => 
      room.buildingId && room.buildingId.toString() === buildingId.toString()
    );

    // Extract unique categories
    const categoriesMap = {};
    roomsInBuilding.forEach(room => {
      if (room.categoryId) {
        const categoryId = room.categoryId.toString();
        const categoryName = room.Category?.categoryName || room.category || `Category ${categoryId}`;
        if (!categoriesMap[categoryId]) {
          categoriesMap[categoryId] = {
            id: categoryId,
            name: categoryName
          };
        }
      }
    });

    const categoriesList = Object.values(categoriesMap);
    setCategories(categoriesList);

    // Get category ID from the booking
    const categoryId = booking.categoryId || '';

    if (categoryId) {
      // Find rooms in this building AND category
      const filteredRooms = rooms.filter(room => 
        room.buildingId && 
        room.buildingId.toString() === buildingId.toString() &&
        room.categoryId && 
        room.categoryId.toString() === categoryId.toString()
      );
      setAvailableRooms(filteredRooms);
    }
  }

  setIsEditModalOpen(true);
};

    
// Proper building change handler
const handleBuildingChange = (e) => {
  console.log("Building selected:", e.target.value);
  const selectedBuildingId = e.target.value;
  
  // Reset dependent selections
  setFormData(prev => ({
    ...prev,
    buildingId: selectedBuildingId,
    building: selectedBuildingId,
    categoryId: '',
    category: '',
    roomId: null,
    roomName: ''
  }));
  
  // Clear any errors
  setFormError(prev => ({ ...prev, building: '', category: '', room: '' }));
  
  // Filter categories for this building
  if (selectedBuildingId && rooms.length > 0) {
    const roomsInBuilding = rooms.filter(room => 
      room.buildingId && room.buildingId.toString() === selectedBuildingId
    );
    
    // Extract unique categories
    const categoriesMap = {};
    roomsInBuilding.forEach(room => {
      if (room.categoryId) {
        const categoryId = room.categoryId.toString();
        const categoryName = room.Category?.categoryName || room.category || `Category ${categoryId}`;
        
        if (!categoriesMap[categoryId]) {
          categoriesMap[categoryId] = {
            id: categoryId,
            name: categoryName
          };
        }
      }
    });
    
    const categoriesList = Object.values(categoriesMap);
    console.log("Categories for this building:", categoriesList);
    setCategories(categoriesList);
  } else {
    // Reset categories if no building selected
    setCategories([]);
  }
  
  // Always reset available rooms when building changes
  setAvailableRooms([]);
};

// Proper category change handler
const handleCategoryChange = (e) => {
  console.log("Category selected:", e.target.value);
  const selectedCategoryId = e.target.value;
  
  // Update category in form data
  setFormData(prev => ({
    ...prev,
    categoryId: selectedCategoryId,
    category: selectedCategoryId,
    roomId: null,
    roomName: ''
  }));
  
  // Clear category-related errors
  setFormError(prev => ({ ...prev, category: '', room: '' }));
  
  // Filter rooms by building AND category
  if (formData.buildingId && selectedCategoryId && rooms.length > 0) {
    console.log("Filtering rooms by building", formData.buildingId, "and category", selectedCategoryId);
    
    const filteredRooms = rooms.filter(room => 
      room.buildingId && 
      room.buildingId.toString() === formData.buildingId.toString() &&
      room.categoryId &&
      room.categoryId.toString() === selectedCategoryId.toString()
    );
    
    console.log("Available rooms:", filteredRooms);
    setAvailableRooms(filteredRooms);
  } else {
    setAvailableRooms([]);
  }
};

// Proper room selection handler
const handleRoomChange = (e) => {
  console.log("Room selected:", e.target.value);
  const selectedRoomId = e.target.value;
  
  // Find full room data for the selected room
  const selectedRoom = rooms.find(room => 
    room.roomId && room.roomId.toString() === selectedRoomId
  );
  
  console.log("Found room data:", selectedRoom);
  
  if (selectedRoom) {
    setFormData(prev => ({
      ...prev,
      roomId: selectedRoomId,
      roomName: selectedRoom.roomName || '',
      bookingCapacity: selectedRoom.capacity || 1
    }));
    setFormError(prev => ({ ...prev, room: '' }));
  }
};

  const handleTimeChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Validate start time before end time
    if (field === 'startTime' && formData.endTime) {
      const start = convertTo24HourFormat(value);
      const end = convertTo24HourFormat(formData.endTime);
      
      if (start >= end) {
        setFormError(prev => ({ 
          ...prev, 
          time: 'Start time must be before end time' 
        }));
      } else {
        setFormError(prev => ({ ...prev, time: '' }));
      }
    }
    
    if (field === 'endTime' && formData.startTime) {
      const start = convertTo24HourFormat(formData.startTime);
      const end = convertTo24HourFormat(value);
      
      if (start >= end) {
        setFormError(prev => ({ 
          ...prev, 
          time: 'End time must be after start time' 
        }));
      } else {
        setFormError(prev => ({ ...prev, time: '' }));
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox inputs differently
  if (type === 'checkbox') {
    setFormData(prev => ({ ...prev, [name]: checked }));
  } else if (name === 'bookingCapacity') {
    const capacityValue = parseInt(value, 10) || 1;
    setFormData(prev => ({
      ...prev,
      bookingCapacity: capacityValue
    }));
  } else {
    setFormData(prev => ({ ...prev, [name]: value }));
  }
    
    // Special handling for certain fields
    if (name === 'recurring') {
      setFormData(prev => ({
        ...prev,
        isRecurring: value !== 'No',
        recurring: value
      }));
    }

    // Handle bookingCapacity as integer
    if (name === 'bookingCapacity') {
      const capacityValue = parseInt(value, 10) || 1; // Default to 1 if parsing fails
      setFormData(prev => ({
        ...prev,
        bookingCapacity: capacityValue
      }));
    }
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    setError('');
    setFormError({});

    const loggedInUserId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
    if (!loggedInUserId) {
      setError('User not authenticated. Please log in again.');
      setSubmitLoading(false);
      return;
    }

    let hasError = false;
    const errors = {};

     if (!formData.firstName || !formData.lastName) {
      errors.name = 'First name and last name are required';
      hasError = true;
    }
    if (!formData.startTime || !formData.endTime) {
      errors.time = 'Start and end times are required';
      hasError = true;
    }
    if (formData.bookingCapacity < 1) {
      errors.bookingCapacity = 'Pax must be at least 1';
      hasError = true;
    }
    if (!formData.roomId) {
      errors.room = 'Room selection is required';
      hasError = true;
    }
    if (!formData.buildingId) {
      errors.building = 'Building is required';
      hasError = true;
    }
    if (formData.isRecurring && !formData.recurrenceEndDate) {
      errors.recurrence = 'Recurrence end date is required for recurring bookings';
      hasError = true;
    }
    if (hasError) {
      setFormError(errors);
      setSubmitLoading(false);
      return;
    }

    try {
      // Convert times to 24-hour format
      const startTimeSQL = convertTo24HourFormat(formData.startTime);
      const endTimeSQL = convertTo24HourFormat(formData.endTime);

      // Use date as 'yyyy-MM-dd' string directly
      const bookingDate = formData.date;

      // Use null for empty recurrenceEndDate and notes
      const recurrenceEndDate = formData.isRecurring && formData.recurrenceEndDate
        ? formData.recurrenceEndDate
        : null;

      // Build payload
      const payload = {
        userId: formData.userId ? Number(formData.userId) : (loggedInUserId ? Number(loggedInUserId) : 2),
        title: formData.title,
        firstName: formData.firstName,
        lastName: formData.lastName,
        buildingId: formData.buildingId,
        categoryId: formData.categoryId,
        roomId: formData.roomId,
        date: bookingDate,
        startTime: startTimeSQL,
        endTime: endTimeSQL,
        department: formData.department,
        isRecurring: Boolean(formData.isRecurring),
        recurrenceEndDate: recurrenceEndDate,
        notes: formData.notes === '' ? null : formData.notes,
        isMealRoom: Boolean(formData.isMealRoom),
        isBreakRoom: Boolean(formData.isBreakRoom),
        bookingCapacity: Number(formData.bookingCapacity) || 1,
        status: (formData.status || 'pending').toLowerCase(),
        numberOfPaxBreakRoom: formData.numberOfPaxBreakRoom || null,
        startTimeBreakRoom: formData.startTimeBreakRoom || null,
        endTimeBreakRoom: formData.endTimeBreakRoom || null,
      };

      // Only add bookingId for edit
      if (isEditModalOpen && editBookingId) {
        payload.bookingId = Number(editBookingId) || editBookingId;
      }

      console.log('Booking Payload:', payload);

      let response;
      if (isEditModalOpen && editBookingId) {
        // Remove bookingId from payload if present
        const { bookingId, ...payloadWithoutId } = payload;
        response = await fetch(
          `${API_BASE_URL}/bookings/${editBookingId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payloadWithoutId),
          }
        );
      } else {
        // Use fetch for POST
        response = await fetch(
          `${API_BASE_URL}/bookings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          }
        );
      }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to save booking.');
    }

    const data = await response.json();

    // Success - reset form and close modal
    resetForm();
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    fetchBookings();
  } catch (err) {
    setError(err.message || 'Failed to save booking. Please try again.');
  } finally {
    setSubmitLoading(false);
  }
};

  // Add this missing resetForm function that will properly reset all fields

  const resetForm = () => {
    setFormData({...initialFormState});
    setFormError({});
    setCategories([]);
    setAvailableRooms([]);
    setEditBookingId(null);
  };

  // User search functionality
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return [];
    
    return users.filter(user => 
      user.firstName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(userSearchQuery.toLowerCase()))
    ).slice(0, 5); // Limit to 5 results
  }, [users, userSearchQuery]);

const getAvailableIntervals = (bookings, businessHours = { start: "08:00", end: "22:00" }) => {
  const buffer = 30; // minutes
  const toMinutesFromISO = iso => {
    const d = new Date(iso);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const toMinutes = str => {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
  };
  if (!bookings || bookings.length === 0) {
    return [{ start: toMinutes(businessHours.start), end: toMinutes(businessHours.end) }];
  }
  const busy = bookings
    .map(b => ({
      start: Math.max(toMinutesFromISO(b.startTime) - buffer, toMinutes(businessHours.start)),
      end: Math.min(toMinutesFromISO(b.endTime) + buffer, toMinutes(businessHours.end)),
    }))
    .sort((a, b) => a.start - b.start);
  const slots = [];
  let current = toMinutes(businessHours.start);
  for (const period of busy) {
    if (period.start > current) {
      slots.push({ start: current, end: period.start });
    }
    current = Math.max(current, period.end);
  }
  if (current < toMinutes(businessHours.end)) {
    slots.push({ start: current, end: toMinutes(businessHours.end) });
  }
  return slots.filter(slot => slot.end > slot.start);
};

  // Converts "HH:MM AM/PM" -> minutes since 00:00
  const timeToMinutes = (timeString) => {
    const [time, period] = timeString.split(" ");
    let [h, m] = time.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Converts minutes since 00:00 -> "h:mm AM/PM"
  const minutesToTime = (minutes) => {
    let h = Math.floor(minutes / 60);
    let m = minutes % 60;
    let suffix = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
  };

const getAvailableStartTimes = () => {
  if (!formData.roomId || !formData.date) return [];
  const editingBookingId = isEditModalOpen ? editBookingId : null;

  const confirmed = bookings.filter(
    b => b.roomId === formData.roomId &&
      b.date === formData.date &&
      b.status?.toLowerCase() === 'confirmed' &&
      (!editingBookingId || b.bookingId !== editingBookingId)
  );
  const intervals = getAvailableIntervals(confirmed);
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = formData.date === todayStr;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let options = [];
  intervals.forEach(({ start, end }) => {
    for (let t = start; t + 30 <= end; t += 30) {
      if (!isToday || t > currentMinutes) {
        options.push(minutesToTime(t));
      }
    }
  });

  // Always add the current value if editing and not present, using formatTime
  if (
    editingBookingId &&
    formData.startTime &&
    !options.includes(formatTime(formData.startTime))
  ) {
    options.push(formatTime(formData.startTime));
    options.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  }
  return options;
};

const getAvailableEndTimes = () => {
  if (!formData.startTime || !formData.roomId || !formData.date) return [];
  const editingBookingId = isEditModalOpen ? editBookingId : null;

  const confirmed = bookings.filter(
    b => b.roomId === formData.roomId &&
      b.date === formData.date &&
      b.status?.toLowerCase() === 'confirmed' &&
      (!editingBookingId || b.bookingId !== editingBookingId)
  );
  const intervals = getAvailableIntervals(confirmed);
  const startMinutes = timeToMinutes(formatTime(formData.startTime));

  const interval = intervals.find(
    ({ start, end }) => start <= startMinutes && startMinutes < end
  );
  let times = [];
  if (interval) {
    for (let t = startMinutes + 30; t <= interval.end; t += 30) {
      times.push(minutesToTime(t));
    }
  }
  // Always add the current value if editing and not present, using formatTime
  if (
    editingBookingId &&
    formData.endTime &&
    !times.includes(formatTime(formData.endTime))
  ) {
    times.push(formatTime(formData.endTime));
    times.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  }
  return times;
};
   
const BookingForm = React.memo(({ isEdit }) => (
  <form onSubmit={handleSubmit} className="space-y-6">
    {/* Error messages */}
    {error && (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2" role="alert">
        <span>{error}</span>
      </div>
    )}
    {formError.name && (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2" role="alert">
        <span>{formError.name}</span>
      </div>
    )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Booking Title</label>
            <input
              type="text"
              name="title"
              defaultValue={formData.title} // Use defaultValue for uncontrolled input
              onBlur={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))} // Update state on blur
              onFocus={(e) => e.target.select()} // Retain focus
              required
              placeholder="Enter booking title"
              autoComplete="off"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              required
              placeholder="Enter first name"
              defaultValue={formData.firstName} // Use defaultValue for uncontrolled input
              onBlur={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} // Update state on blur
              autoComplete="off"
              className={`w-full p-2 border ${formError.name ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              name="lastName"
              defaultValue={formData.lastName} // Use defaultValue for uncontrolled input
              onBlur={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} // Update state on blur
              required
              placeholder="Enter last name"
              autoComplete="off"
              className={`w-full p-2 border ${formError.name ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
            <select
              name="department"
              value={formData.department}
              onChange={handleInputChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select School</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={formData.status || 'pending'}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Building</label>
            <select
              name="buildingId"
              value={formData.buildingId || ''}
              onChange={handleBuildingChange}
              required
              className={`w-full p-2 border ${formError.building ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500`}
            >
              <option value="">Select Building</option>
              {buildings.map(building => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            {formError.building && <p className="text-red-500 text-xs mt-1">{formError.building}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              name="categoryId"
              value={formData.categoryId || ''}
              onChange={handleCategoryChange}
              required
              disabled={!formData.buildingId}
              className={`w-full p-2 border ${formError.category ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500 ${!formData.buildingId ? 'bg-gray-100' : 'bg-white'}`}
            >
              <option value="">Select Category</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {formError.category && <p className="text-red-500 text-xs mt-1">{formError.category}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <select
              name="roomId"
              value={formData.roomId || ''}
              onChange={handleRoomChange}
              required
              disabled={!formData.categoryId}
              className={`w-full p-2 border ${formError.room ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500 ${!formData.categoryId ? 'bg-gray-100' : 'bg-white'}`}
            >
              <option value="">Select Room</option>
              {availableRooms.map(room => (
                <option key={room.roomId} value={room.roomId}>
                  {room.roomName} {room.capacity ? `(Capacity: ${room.capacity})` : ''}
                </option>
              ))}
            </select>
            {formError.room && <p className="text-red-500 text-xs mt-1">{formError.room}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pax</label>
            <input
              type="number"
              name="bookingCapacity"
              value={formData.bookingCapacity || 1}
              onBlur={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} // Update state on blur
              min="1"
              required
              className={`w-full p-2 border ${formError.bookingCapacity ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-blue-500 focus:border-blue-500`}
            />
            {formError.bookingCapacity && <p className="text-red-500 text-xs mt-1">{formError.bookingCapacity}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
              min={new Date().toISOString().split('T')[0]} // disables past dates
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <select
              value={formData.startTime || ''}
              onChange={(e) => handleTimeChange('startTime', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select Start Time</option>
              {getAvailableStartTimes().map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <select
              value={formData.endTime || ''}
              onChange={(e) => handleTimeChange('endTime', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
              disabled={!formData.startTime}
            >
              <option value="">Select End Time</option>
              {getAvailableEndTimes().map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>

    {/* Divider */}
      <div className="border-t pt-4 mt-2 flex flex-col items-center">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700">Other Request</label>
        </div>
        <div className="flex flex-row flex-wrap justify-center gap-12">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isMealRoom"
              name="isMealRoom"
              checked={formData.isMealRoom}
              onChange={(e) => setFormData((prev) => ({ ...prev, isMealRoom: e.target.checked }))}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isMealRoom" className="ml-2 text-sm text-gray-700">
              Meal Room
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isBreakRoom"
              name="isBreakRoom"
              checked={formData.isBreakRoom}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  isBreakRoom: e.target.checked,
                  // Reset break room details when unchecked
                  ...(e.target.checked
                    ? {}
                    : {
                        numberOfPaxBreakRoom: '',
                        startTimeBreakRoom: '',
                        endTimeBreakRoom: '',
                      }),
                }))
              }
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isBreakRoom" className="ml-2 text-sm text-gray-700">
              Break Room
            </label>
          </div>
        </div>
      </div>


      {formData.isBreakRoom && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 mt-4 w-full">
        {/* Number of Pax for Break Room */}
        <div className="md:col-span-2">
          <label className="block text-gray-700 font-medium mb-2">
            Number of Pax (Break Room) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="numberOfPaxBreakRoom"
            value={formData.numberOfPaxBreakRoom || ''}
            onChange={e => setFormData(prev => ({
              ...prev,
              numberOfPaxBreakRoom: e.target.value,
            }))}
            min={1}
            className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter number of participants for break room"
            required={formData.isBreakRoom}
          />
        </div>
        {/* Start Time for Break Room */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Break Room Start Time <span className="text-red-500">*</span>
          </label>
          <select
            name="startTimeBreakRoom"
            value={formData.startTimeBreakRoom || ''}
            onChange={e => setFormData(prev => ({
              ...prev,
              startTimeBreakRoom: e.target.value,
              // Reset end time if start changes
              endTimeBreakRoom: '',
            }))}
            className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required={formData.isBreakRoom}
          >
            <option value="">Select Start Time</option>
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </div>
        {/* End Time for Break Room */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Break Room End Time <span className="text-red-500">*</span>
          </label>
          <select
            name="endTimeBreakRoom"
            value={formData.endTimeBreakRoom || ''}
            onChange={e => setFormData(prev => ({
              ...prev,
              endTimeBreakRoom: e.target.value,
            }))}
            className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required={formData.isBreakRoom}
            disabled={!formData.startTimeBreakRoom}
          >
            <option value="">Select End Time</option>
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

      <div className="pt-4 mt-2 flex flex-col items-center">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isRecurring"
            name="isRecurring"
            checked={formData.isRecurring}
            onChange={(e) => {
              setFormData(prev => ({
                ...prev,
                isRecurring: e.target.checked,
                recurring: e.target.checked ? 'Daily' : 'No',
                recurrenceEndDate: e.target.checked ? prev.recurrenceEndDate || formData.date : ''
              }))
            }}
            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="isRecurring" className="ml-2 text-sm text-gray-700">
            Recurring Booking
          </label>
        </div>  
      </div>

      {/* Recurring fields */}
      {formData.isRecurring && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Recurrence Pattern</label>
            <select
              name="recurring"
              value={formData.recurring || "Daily"}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Recurrence End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="recurrenceEndDate"
              value={formData.recurrenceEndDate || ""}
              onChange={handleInputChange}
              required={formData.isRecurring}
              min={formData.date}
              className={`w-full p-2 border ${formError.recurrence ? 'border-red-500' : 'border-gray-300'} rounded-md focus:ring-2 focus:ring-blue-400`}
            />
            {formError.recurrence && <p className="text-red-500 text-xs mt-1">{formError.recurrence}</p>}
          </div>
        </div>
      )}

    {/* Notes and Remarks */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
        <textarea
          name="notes"
          value={formData.notes || ''}
          onChange={handleInputChange}
          rows="3"
          placeholder="Add any additional notes here"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
        ></textarea>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Remarks</label>
        <textarea
          name="remarks"
          value={formData.remarks || ''}
          onChange={handleInputChange}
          rows="3"
          placeholder="Add any additional remarks here"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
        ></textarea>
      </div>
    </div>

    {/* Actions */}
    <div className="flex justify-end gap-3 pt-4">
      <button
        type="button"
        onClick={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          resetForm();
        }}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        disabled={submitLoading}
      >
        Cancel
      </button>
      <button
        type="submit"
        className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 ${submitLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
        disabled={submitLoading}
      >
        {submitLoading ? 'Processing...' : isEdit ? 'Update Booking' : 'Create Booking'}
      </button>
    </div>
  </form>
));

// Memoized Modal component
const Modal = React.memo(({ isOpen, title, children, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        
        {/* Close (X) Button */}
        <button
            onClick={() => {
              setIsAddModalOpen(false);
              setIsEditModalOpen(false);
              resetForm();
            }}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-xl font-bold"
          aria-label="Close modal"
        >
          ×
        </button>

        <h3 className="text-xl font-bold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
});


  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };
  
  const sortedBookings = [...currentBookings].sort((a, b) => {
    const { key, direction } = sortConfig;
    if (!key) return 0;

    let valA = a[key];
    let valB = b[key];

    // Special handling for booleans and numbers
    if (key === 'isMealRoom' || key === 'isBreakRoom') {
      valA = !!valA ? 1 : 0;
      valB = !!valB ? 1 : 0;
    } else if (key === 'bookingCapacity') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else if (key === 'date') {
      valA = new Date(valA);
      valB = new Date(valB);
    } else {
      valA = typeof valA === 'string' ? valA.toLowerCase() : valA;
      valB = typeof valB === 'string' ? valB.toLowerCase() : valB;
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
 
  const handleStatusChange = (bookingId, status) => {
    setSelectedBookingId(bookingId);
    setSelectedStatus(status);
    setIsStatusModalOpen(true);
  };
  return (
    <div style={{ position: 'fixed', top: 0, left: 257, width: 'calc(100% - 257px)', zIndex: 500, overflowY: 'auto', height: '100vh'}}>
      <TopBar onSearch={setSearchTerm} />
      <div className="p-4 bg-gray-100 w-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Bookings</h2>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-200 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100 flex items-center gap-1"
              title="Refresh Page"
            >
              <span role="img" aria-label="refresh">🔄</span>
              Refresh
            </button>
            <button
              onClick={handleAddNewClick}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + Add New Booking
            </button>
            <ExcelEventBulletinExporter bookings={bookings} />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4">
            {['All', 'Pending', 'Confirmed', 'Declined'].map((status) => (
              <TabButton
                key={status}
                label={status}
                active={activeBookingTab === status.toLowerCase()}
                onClick={() => {
                  setActiveBookingTab(status.toLowerCase());
                  setCurrentPage(1); // Reset to first page when switching tabs
                }}
              />
            ))}
          </div>
        </div>

        {/* Loading and Error States */}
        {loading && <div className="text-center py-4">Loading bookings...</div>}
        {error && <div className="text-center py-4 text-red-500">{error}</div>}

        {/* Bookings Table */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100">
                {[
                  { key: 'title', label: 'Booking Title' },
                  { key: 'firstName', label: 'First Name' },
                  { key: 'lastName', label: 'Last Name' },
                  { key: 'building', label: 'Building' },
                  { key: 'category', label: 'Category' },
                  { key: 'roomName', label: 'Room' },
                  { key: 'date', label: 'Date' },
                  { key: 'startTime', label: 'Time' },
                  { key: 'bookingCapacity', label: 'Capacity' },
                  { key: 'isMealRoom', label: 'Meal Room' },
                  { key: 'isBreakRoom', label: 'Break Room' },
                  { key: 'status', label: 'Status' },
                  { key: 'timeSubmitted', label: 'Time Submitted' }, // <-- Add this line
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="cursor-pointer px-4 py-2 border-b"
                  >
                    {label} {sortConfig.key === key && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                <th className="px-4 py-2 border-b">Actions</th>
              </tr>
            </thead>

            <tbody>
            {!loading && currentBookings.length > 0 ? (
              sortedBookings
                .filter(booking =>
                  `${booking.title} ${booking.firstName} ${booking.lastName} ${booking.department} ${booking.category} ${booking.roomName} ${booking.building}`
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase())
                )
                .map((booking) => (
                  <tr key={booking.bookingId || booking.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2 border-b">{booking.title}</td>
                    <td className="px-4 py-2 border-b">{booking.firstName}</td>
                    <td className="px-4 py-2 border-b">{booking.lastName}</td>
                    <td className="px-4 py-2 border-b">{booking.building}</td>
                    <td className="px-4 py-2 border-b">{booking.category}</td>
                    <td className="px-4 py-2 border-b">{booking.roomName}</td>
                    <td className="px-4 py-2 border-b">
                      {booking.recurring !== 'No' && booking.recurrenceEndDate ? (
                        <div>
                          {formatDate(booking.date)} - {formatDate(booking.recurrenceEndDate)} ({booking.recurring})
                        </div>
                      ) : (
                        <div>{formatDate(booking.date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 border-b">
                  {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                    </td>
                    <td className="px-4 py-2 border-b">{booking.bookingCapacity || '1'}</td>
                    <td className="px-4 py-2 border-b">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        booking.isMealRoom ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {booking.isMealRoom ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        booking.isBreakRoom ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {booking.isBreakRoom ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b">
                      <div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            booking.status === 'confirmed'
                              ? 'bg-green-100 text-green-600'
                              : booking.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-600'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                        {/* Only show "Changed by" if status is confirmed/declined and changedBy exists */}
                        {['confirmed', 'declined'].includes(booking.status) && booking.changedBy && (
                          <small className="block text-gray-500 mt-1">
                            Changed by: {booking.changedBy}
                          </small>
                        )}
                      </div>
                    </td>
                      <td className="px-4 py-2 border-b">
                        {/* Format timeSubmitted as readable date/time */}
                        {booking.timeSubmitted
                          ? new Date(booking.timeSubmitted).toLocaleString()
                          : ''}
                      </td>
                    <td className="px-4 py-2 border-b">
                      <div className="flex space-x-2">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => handleEditClick(booking)}
                        >
                          View
                        </button>
                        <button
                          className="text-green-600 hover:underline"
                          onClick={() => handleStatusChange(booking.bookingId, 'confirmed')} // Ensure booking.bookingId is used
                        >
                          Confirm
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => handleStatusChange(booking.bookingId, 'declined')} // Ensure booking.bookingId is used
                        >
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                !loading && (
                  <tr>
                    <td colSpan="17" className="px-4 py-4 text-center text-gray-500">
                      No bookings found. Add a new booking to get started.
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredBookings.length > 0 && (
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={handlePreviousPage}  
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span className="text-gray-800">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className={`px-4 py-2 rounded-lg font-medium transition ${
                currentPage === totalPages || totalPages === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white'
              }`}
              onClick={handleNextPage}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Add Booking Modal */}
      <Modal isOpen={isAddModalOpen} title="Add New Booking" onClose={() => { setIsAddModalOpen(false); resetForm(); }}>
        <BookingForm isEdit={false} />
      </Modal>

      {/* Edit Booking Modal */}
      <Modal isOpen={isEditModalOpen} title="Edit Booking" onClose={() => { setIsEditModalOpen(false); resetForm(); }}>
        <BookingForm isEdit={true} />
      </Modal>

      {/* Status Modal */}
      <StatusModal
        isOpen={isStatusModalOpen}
        currentStatus={selectedStatus}
        onClose={() => setIsStatusModalOpen(false)}
        onConfirm={async () => {
          try {
            setSubmitLoading(true); // Show loading state

            // Validate selectedBookingId
            if (!selectedBookingId) {
              console.error("Error: selectedBookingId is undefined.");
              setError("Failed to update booking. Booking ID is missing.");
              setSubmitLoading(false);
              return;
            }

            // Fetch the full booking object first using fetch
            const bookingRes = await fetch(
              `${API_BASE_URL}/bookings/${selectedBookingId}`,
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );
            if (!bookingRes.ok) {
              throw new Error("Could not fetch booking details");
            }
            const booking = await bookingRes.json();

            // Get current user's ID and fetch details
            const userId = localStorage.getItem('userId');
            let changedBy = 'Unknown User';

            if (userId) {
              try {
                const userResponse = await fetch(`${API_BASE_URL}/users/${userId}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  changedBy = `${userData.firstName} ${userData.lastName}`;
                }
              } catch (error) {
                // Continue with default name
              }
            }

            // Create a simplified update payload - only send necessary fields
            const updatePayload = {
              status: selectedStatus.toLowerCase(),
              changedBy: changedBy,
              bookingId: booking.bookingId,
            };

            // Make the update request using fetch
            const response = await fetch(
              `${API_BASE_URL}/bookings/${selectedBookingId}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(updatePayload),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Failed to update booking.');
            }

            // Success - refresh bookings and close modal
            await fetchBookings();
            setIsStatusModalOpen(false);
          } catch (err) {
            // Better error handling
            if (err.message) {
              setError(`Failed to update booking: ${err.message}`);
            } else {
              setError('Failed to update booking status. Please try again.');
            }
          } finally {
            setSubmitLoading(false);
          }
        }}
      />
    </div>
  );
};

export default Bookings;