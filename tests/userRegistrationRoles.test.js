jest.mock("../src/models/User", () => ({
  exists: jest.fn(),
  create: jest.fn(),
  userRoles: ["Citizen", "Volunteer", "DMC Officer", "District Officer"],
}));

const User = require("../src/models/User");
const { register } = require("../src/controllers/userController");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "registration-tests-only-secret";
});

test.each(["DMC Officer", "District Officer"])(
  "does not allow public registration to assign the %s role",
  async (role) => {
    const res = responseRecorder();

    await register({
      body: { name: "Test User", email: "user@example.lk", password: "password123", role },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Staff accounts must be provisioned/);
    expect(User.create).not.toHaveBeenCalled();
  },
);

test("keeps public citizen registration working without a requested role", async () => {
  User.exists.mockResolvedValue(false);
  User.create.mockResolvedValue({
    _id: "citizen-id",
    name: "Test User",
    email: "user@example.lk",
    role: "Citizen",
    district: "Colombo",
  });
  const res = responseRecorder();

  await register({
    body: {
      name: "Test User",
      email: "user@example.lk",
      password: "password123",
      district: "Colombo",
    },
  }, res);

  expect(res.statusCode).toBe(201);
  expect(res.body.data.user.role).toBe("Citizen");
  expect(typeof res.body.data.token).toBe("string");
});
