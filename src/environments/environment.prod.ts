// Uses the same host you open in the browser (PC or phone on LAN).
// Example: http://192.168.1.25  ->  API http://192.168.1.25:5000/api
export const environment = {
  production: true,
  apiUrl: `http://${window.location.hostname}:7196/api`
};
