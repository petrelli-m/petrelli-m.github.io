/* =================================================================
   data/projects.js
   REALISE and REALI3SE for the second figure in the hero: the two
   projects, and their organisations grouped by place, with the role of
   each organisation in each project. Consortia and EU contributions as
   listed by CORDIS (cordis.europa.eu/project/id/101226206 and
   /101299493). Edit by hand; script.js counts beneficiaries, partners
   and countries from this list.

   role: 'coordinator', 'beneficiary' or 'partner' (associated partner)
   label: name written on the map next to the place (optional)
   ================================================================= */

const PROJECTS = {
  projects: [
    {
      id: 'REALISE',
      logo: 'logos/realise.webp',
      colour: '#FFCA14',
      action: 'MSCA Doctoral Network',
      period: 'February 2026 – January 2030',
      title: 'Bridging igneous petrology and machine learning for science and society',
      contribution: 4356827.64,
      people: '15 doctoral candidates'
    },
    {
      id: 'REALI3SE',
      logo: 'logos/reali3se.png',
      colour: '#E01772',
      action: 'MSCA Staff Exchanges',
      period: 'November 2026 – October 2030',
      title: 'Bridging igneous petrology and machine learning through intersectoral, interdisciplinary and intercontinental staff exchanges',
      contribution: 1172340,
      people: null
    }
  ],

  sites: [
    {
      place: 'Perugia', country: 'Italy', lat: 43.117, lon: 12.389, label: 'Perugia',
      organisations: [
        { name: 'Università degli Studi di Perugia', REALISE: 'coordinator', REALI3SE: 'coordinator' }
      ]
    },
    {
      place: 'Rome and Frascati', country: 'Italy', lat: 41.87, lon: 12.53,
      organisations: [
        { name: 'Istituto Nazionale di Geofisica e Vulcanologia (INGV)', REALISE: 'partner', REALI3SE: 'beneficiary' },
        { name: 'Dipartimento della Protezione Civile', REALISE: 'partner' },
        { name: 'Istituto Nazionale di Fisica Nucleare (INFN)', REALISE: 'partner' }
      ]
    },
    {
      place: 'Paris and Saint-Aubin', country: 'France', lat: 48.81, lon: 2.30,
      organisations: [
        { name: 'Sorbonne Université', REALISE: 'beneficiary', REALI3SE: 'beneficiary' },
        { name: 'CNRS', REALISE: 'beneficiary' },
        { name: 'Institut de physique du globe de Paris', REALISE: 'beneficiary' },
        { name: 'Synchrotron SOLEIL', REALISE: 'partner', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Orléans', country: 'France', lat: 47.84, lon: 1.94,
      organisations: [
        { name: 'BRGM, French geological survey', REALISE: 'partner' },
        { name: 'Université d’Orléans', REALISE: 'partner' }
      ]
    },
    {
      place: 'Loos', country: 'France', lat: 50.61, lon: 3.02,
      organisations: [
        { name: 'Ainoudo', REALISE: 'partner' }
      ]
    },
    {
      place: 'Leuven', country: 'Belgium', lat: 50.879, lon: 4.701,
      organisations: [
        { name: 'KU Leuven', REALISE: 'beneficiary', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Amsterdam', country: 'Netherlands', lat: 52.369, lon: 4.890,
      organisations: [
        { name: 'Universiteit van Amsterdam', REALISE: 'partner' }
      ]
    },
    {
      place: 'Hannover', country: 'Germany', lat: 52.39, lon: 9.75,
      organisations: [
        { name: 'Leibniz Universität Hannover', REALISE: 'beneficiary', REALI3SE: 'beneficiary' },
        { name: 'Federal Institute for Geosciences and Natural Resources (BGR)', REALISE: 'partner' }
      ]
    },
    {
      place: 'Heidelberg', country: 'Germany', lat: 49.415, lon: 8.656,
      organisations: [
        { name: 'Teledyne GmbH', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Berlin', country: 'Germany', lat: 52.556, lon: 13.379,
      organisations: [
        { name: 'TerraTrace', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Budapest', country: 'Hungary', lat: 47.491, lon: 19.059,
      organisations: [
        { name: 'Eötvös Loránd University (ELTE)', REALISE: 'beneficiary' }
      ]
    },
    {
      place: 'Ljubljana', country: 'Slovenia', lat: 46.05, lon: 14.50,
      organisations: [
        { name: 'University of Ljubljana', REALISE: 'beneficiary', REALI3SE: 'beneficiary' },
        { name: 'Kemijski inštitut', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Brno', country: 'Czechia', lat: 49.202, lon: 16.604,
      organisations: [
        { name: 'Brno University of Technology', REALI3SE: 'beneficiary' }
      ]
    },
    {
      place: 'Wrexham', country: 'United Kingdom', lat: 53.035, lon: -2.950,
      organisations: [
        { name: 'Nu Instruments', REALISE: 'partner' }
      ]
    },
    {
      place: 'Bozeman', country: 'United States', lat: 45.716, lon: -111.068, label: 'Bozeman',
      organisations: [
        { name: 'Teledyne Photon Machines', REALISE: 'partner' }
      ]
    },
    {
      place: 'Santa Fe', country: 'United States', lat: 35.687, lon: -105.938, label: 'Santa Fe',
      organisations: [
        { name: 'EnviTrace', REALI3SE: 'partner' }
      ]
    },
    {
      place: 'Bogotá', country: 'Colombia', lat: 4.602, lon: -74.066, label: 'Bogotá',
      organisations: [
        { name: 'Universidad de los Andes', REALI3SE: 'partner' }
      ]
    },
    {
      place: 'San Salvador de Jujuy', country: 'Argentina', lat: -24.186, lon: -65.300, label: 'Jujuy',
      organisations: [
        { name: 'Universidad Nacional de Jujuy', REALI3SE: 'partner' }
      ]
    },
    {
      place: 'Lubumbashi', country: 'Democratic Republic of the Congo', lat: -11.664, lon: 27.479, label: 'Lubumbashi',
      organisations: [
        { name: 'Université de Lubumbashi', REALI3SE: 'partner' }
      ]
    },
    {
      place: 'Johannesburg', country: 'South Africa', lat: -26.183, lon: 28.005, label: 'Johannesburg',
      organisations: [
        { name: 'DSTI-NRF CIMERA', REALI3SE: 'partner' }
      ]
    }
  ]
};
