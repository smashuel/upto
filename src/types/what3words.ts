export interface What3WordsAddress {
  words: string;
  map: string;
  language: string;
  country: string;
  square: {
    southwest: {
      lat: number;
      lng: number;
    };
    northeast: {
      lat: number;
      lng: number;
    };
  };
  nearestPlace: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface What3WordsLocation {
  coordinates: {
    lat: number;
    lng: number;
  };
  words?: string;
  square?: {
    southwest: {
      lat: number;
      lng: number;
    };
    northeast: {
      lat: number;
      lng: number;
    };
  };
  nearestPlace?: string;
  country?: string;
}

export interface What3WordsSuggestion {
  words: string;
  country: string;
  nearestPlace: string;
  distanceToFocusKm?: number;
  rank: number;
  language: string;
}

export interface What3WordsError {
  code: string;
  message: string;
}

export interface What3WordsGridSection {
  lat: number;
  lng: number;
  words: string;
}

export interface LocationInputType {
  type: 'coordinates' | 'what3words';
  value: string;
  isValid: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
  what3words?: string;
}