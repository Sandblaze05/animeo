import { NextResponse } from 'next/server';
import { getProfiles, createProfile, deleteProfile } from '@/utils/sqlite';

export async function GET() {
  try {
    const profiles = getProfiles();
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name, avatar } = await request.json();
    if (!name) return NextResponse.json({ message: 'Name required' }, { status: 400 });
    const profile = createProfile(name, avatar ?? null);
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });
    deleteProfile(id);
    return NextResponse.json({});
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
