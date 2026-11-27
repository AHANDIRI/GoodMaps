export type AbilityType =
  | 'moteur'
  | 'sensoriel'
  | 'mental'
  | 'psychique'
  | 'cognitif'
  | 'multi'
  | 'valide';

export type ActivityCategory =
  | 'Culture'
  | 'Nature'
  | 'Sport'
  | 'Loisirs'
  | 'Restauration'
  | 'Autre';

export interface UserInfo {
  ability: AbilityType | string;
  activityPreferences: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Activity {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  category?: ActivityCategory;
  accessibility?: string;
  address?: string;
  opening_hours?: string;
  booking_link?: string;
  phone_number?: string;
  source?: 'openai' | 'openstreetmap' | 'curated';
}

export interface ApiResponse {
  activities: Activity[];
}

export interface GeocodingResult {
  display_name: string;
  lat: number;
  lng: number;
}
