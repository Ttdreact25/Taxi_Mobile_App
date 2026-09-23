import { useState, useEffect } from 'react'
import { LocationService } from '../services/LocationService'

export function useLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    LocationService.getCurrentLocation()
      .then(setLocation)
      .catch(() => setLocation(null))
      .finally(() => setLoading(false))
  }, [])

  return { location, loading }
}
