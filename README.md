# Inventory Management Backend API

A robust Node.js backend API for inventory management system with user management capabilities.

## Features

- ✅ User registration with validation
- ✅ Get all users with pagination and search
- ✅ Get user by ID
- ✅ Update user information
- ✅ Soft delete users
- ✅ Yup validation middleware
- ✅ Password hashing with bcrypt
- ✅ MongoDB with Mongoose ODM
- ✅ Express.js REST API
- ✅ CORS enabled
- ✅ Error handling middleware
- ✅ Request logging

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **ODM**: Mongoose
- **Validation**: Yup
- **Password Hashing**: bcryptjs
- **Authentication**: JWT (ready for implementation)

## Project Structure

```
src/
├── config/
│   └── db.js              # Database connection
├── controllers/
│   └── userController.js   # User business logic
├── middlewares/
│   └── userValidation.js   # Yup validation schemas
├── models/
│   └── user.js            # User mongoose schema
├── routes/
│   ├── allrouts.js        # Main router
│   └── userRoute.js       # User routes
├── util/
│   └── commonResponses.js  # Response utilities
├── app.js                 # Express app setup
└── server.js              # Server entry point
```

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd inventory-management-be
```

2. Install dependencies
```bash
npm install
```

3. Create environment file
```bash
cp env.example .env
```

4. Configure environment variables in `.env`
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/inventory-management
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
```

5. Start the server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Base URL
```
http://localhost:5000/api/v1
```

### Health Check
```
GET /health
```

### User Management

#### 1. Register User
```
POST /users/register
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "contactNumber": "1234567890",
  "address": "123 Main Street, City, State 12345",
  "platformUsername": "johndoe",
  "company": "ABC Company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "status": 201,
  "data": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "contactNumber": "1234567890",
    "address": "123 Main Street, City, State 12345",
    "platformUsername": "johndoe",
    "company": "ABC Company",
    "isActive": true,
    "role": "user",
    "createdAt": "2023-09-06T10:30:00.000Z",
    "updatedAt": "2023-09-06T10:30:00.000Z"
  }
}
```

#### 2. Get All Users
```
GET /users?page=1&limit=10&search=john&sortBy=createdAt&sortOrder=desc
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search term for name, email, company, or username
- `sortBy` (optional): Sort field (default: createdAt)
- `sortOrder` (optional): Sort direction - 'asc' or 'desc' (default: desc)

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "status": 200,
  "data": {
    "users": [
      {
        "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "contactNumber": "1234567890",
        "address": "123 Main Street, City, State 12345",
        "platformUsername": "johndoe",
        "company": "ABC Company",
        "isActive": true,
        "role": "user",
        "createdAt": "2023-09-06T10:30:00.000Z",
        "updatedAt": "2023-09-06T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalUsers": 1,
      "hasNextPage": false,
      "hasPrevPage": false,
      "limit": 10
    }
  }
}
```

#### 3. Get User by ID
```
GET /users/:id
```

**Response:**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "status": 200,
  "data": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "contactNumber": "1234567890",
    "address": "123 Main Street, City, State 12345",
    "platformUsername": "johndoe",
    "company": "ABC Company",
    "isActive": true,
    "role": "user",
    "createdAt": "2023-09-06T10:30:00.000Z",
    "updatedAt": "2023-09-06T10:30:00.000Z"
  }
}
```

#### 4. Update User
```
PUT /users/:id
```

**Request Body:**
```json
{
  "firstName": "Jane",
  "company": "XYZ Company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User updated successfully",
  "status": 200,
  "data": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "contactNumber": "1234567890",
    "address": "123 Main Street, City, State 12345",
    "platformUsername": "johndoe",
    "company": "XYZ Company",
    "isActive": true,
    "role": "user",
    "createdAt": "2023-09-06T10:30:00.000Z",
    "updatedAt": "2023-09-06T10:35:00.000Z"
  }
}
```

#### 5. Delete User (Soft Delete)
```
DELETE /users/:id
```

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully",
  "status": 200,
  "data": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "contactNumber": "1234567890",
    "address": "123 Main Street, City, State 12345",
    "platformUsername": "johndoe",
    "company": "ABC Company",
    "isActive": false,
    "role": "user",
    "createdAt": "2023-09-06T10:30:00.000Z",
    "updatedAt": "2023-09-06T10:40:00.000Z"
  }
}
```

## Validation Rules

### User Registration Validation
- **firstName**: Required, 2-50 characters, letters and spaces only
- **lastName**: Required, 2-50 characters, letters and spaces only
- **email**: Required, valid email format, max 100 characters
- **password**: Required, minimum 6 characters
- **contactNumber**: Required, 10-15 digits
- **address**: Required, 10-200 characters
- **platformUsername**: Required, 3-50 characters, alphanumeric and underscore only
- **company**: Required, 2-100 characters, letters, numbers, spaces, &, ., and - only

## Error Responses

### Validation Error
```json
{
  "success": false,
  "status": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email address"
    }
  ]
}
```

### Not Found Error
```json
{
  "success": false,
  "status": 404,
  "message": "User not found",
  "data": null
}
```

### Server Error
```json
{
  "success": false,
  "status": 500,
  "message": "Internal server error",
  "data": null
}
```

## Database Schema

### User Model
```javascript
{
  firstName: String (required, 2-50 chars),
  lastName: String (required, 2-50 chars),
  email: String (required, unique, lowercase),
  password: String (required, hashed),
  contactNumber: String (required, 10-15 digits),
  address: String (required, 10-200 chars),
  platformUsername: String (required, unique, 3-50 chars),
  company: String (required, 2-100 chars),
  isActive: Boolean (default: true),
  role: String (enum: ['user', 'admin'], default: 'user'),
  createdAt: Date,
  updatedAt: Date
}
```

## Security Features

- Password hashing with bcrypt (12 salt rounds)
- Input validation with Yup
- CORS enabled
- Request size limits
- Error handling without exposing sensitive information
- Soft delete functionality

## Future Enhancements

- [ ] JWT Authentication
- [ ] Password reset functionality
- [ ] Email verification
- [ ] Role-based access control
- [ ] API rate limiting
- [ ] Request logging to file
- [ ] Unit tests
- [ ] API documentation with Swagger

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the ISC License. #   i n v e n t o r y - m a n a g e m e n t - b e  
 